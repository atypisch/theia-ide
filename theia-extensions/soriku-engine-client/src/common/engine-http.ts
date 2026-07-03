/********************************************************************************
 * Soriku IDE — HTTP + SSE transport (testable, no Theia deps)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import {
    EngineError,
    EngineUnavailableError,
    StreamInterruptedError,
    engineErrorFromStatus,
} from './engine-errors';
import { EngineClientConfig, SorikuSseEvent } from './engine-types';

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
}

export function joinUrl(baseUrl: string, path: string): string {
    const base = normalizeBaseUrl(baseUrl);
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}

export function buildAuthHeaders(config: EngineClientConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    if (config.authToken) {
        headers['Authorization'] = `Bearer ${config.authToken}`;
    }
    return headers;
}

export class EngineHttpTransport {
    constructor(
        private readonly config: EngineClientConfig,
        private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
    ) { }

    getConfig(): EngineClientConfig {
        return this.config;
    }

    async getJson<T>(path: string): Promise<T> {
        return this.requestJson<T>('GET', path);
    }

    async postJson<T>(path: string, body?: unknown): Promise<T> {
        return this.requestJson<T>('POST', path, body);
    }

    async patchJson<T>(path: string, body: unknown): Promise<T> {
        return this.requestJson<T>('PATCH', path, body);
    }

    async deleteJson<T>(path: string): Promise<T> {
        return this.requestJson<T>('DELETE', path);
    }

    async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
        const response = await this.rawRequest(method, path, body, false);
        if (response.status === 204) {
            return undefined as T;
        }
        const text = await response.text();
        if (!text) {
            return undefined as T;
        }
        try {
            return JSON.parse(text) as T;
        } catch (error) {
            throw new EngineError('parse', `Failed to parse JSON from ${path}`, { cause: error as Error, status: response.status, body: text });
        }
    }

    /** Default idle watchdog: a stream that stays byte-silent this long is considered hung (#4). */
    static readonly DEFAULT_SSE_IDLE_TIMEOUT_MS = 300_000;

    async *postSse(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent> {
        const response = await this.rawRequest('POST', path, body, true, signal);
        if (!response.body) {
            throw new StreamInterruptedError(`SSE response has no body for ${path}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // Idle watchdog (#4): SSE has no overall timeout (a long turn is legitimate),
        // but a stream that produces NO bytes at all for idleMs means a hung engine —
        // without this, reader.read() blocks forever. One resettable timer, re-armed
        // on every chunk; the guarded promise only rejects while a read is racing it.
        const idleMs = this.config.sseIdleTimeoutMs ?? EngineHttpTransport.DEFAULT_SSE_IDLE_TIMEOUT_MS;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        let idleReject: ((e: Error) => void) | undefined;
        const idleFailure = new Promise<never>((_, reject) => { idleReject = reject; });
        idleFailure.catch(() => { /* handled via Promise.race; avoid unhandled-rejection noise */ });
        const armIdle = () => {
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(
                () => idleReject?.(new StreamInterruptedError(`SSE stream idle for ${idleMs}ms on ${path} — engine hung?`)),
                idleMs,
            );
        };
        try {
            while (true) {
                let chunk: Awaited<ReturnType<typeof reader.read>>;
                try {
                    armIdle();
                    chunk = await Promise.race([reader.read(), idleFailure]);
                } catch (error) {
                    if ((error as Error).name === 'AbortError') {
                        throw new EngineError('aborted', `SSE stream aborted: ${path}`);
                    }
                    if (error instanceof StreamInterruptedError) {
                        throw error;
                    }
                    throw new StreamInterruptedError(`SSE stream interrupted for ${path}: ${(error as Error).message}`, { cause: error as Error });
                }
                const { done, value } = chunk;
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');
                while (boundary >= 0) {
                    const rawEvent = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const parsed = this.safeParseSse(rawEvent);
                    if (parsed) {
                        yield parsed;
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }
            if (buffer.trim()) {
                const parsed = this.safeParseSse(buffer);
                if (parsed) {
                    yield parsed;
                }
            }
        } finally {
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
            // Cancel the body, don't just release the lock (#6): on early consumer
            // exit (widget disposed, error thrown) releaseLock alone left the HTTP
            // connection open and downloading. cancel() drains/aborts it.
            try {
                await reader.cancel();
            } catch { /* already errored/closed — nothing to cancel */ }
            try {
                reader.releaseLock();
            } catch { /* lock already released by cancel/close */ }
        }
    }

    /**
     * Parse one SSE frame without letting a single malformed frame abort the whole stream.
     * Malformed JSON is a TRANSPORT problem, not an engine answer: it is surfaced as a
     * distinct `transport_error` event (#3) so the reducer can skip it and keep streaming —
     * a plain `error` event remains reserved for real engine-reported failures.
     */
    private safeParseSse(rawEvent: string): SorikuSseEvent | undefined {
        try {
            return parseSseChunk(rawEvent);
        } catch (error) {
            return { type: 'transport_error', code: 'malformed_sse', message: (error as Error).message, raw: rawEvent };
        }
    }

    private async rawRequest(method: string, path: string, body: unknown | undefined, stream: boolean, signal?: AbortSignal): Promise<Response> {
        const headers = buildAuthHeaders(this.config);
        if (stream) {
            headers['Accept'] = 'text/event-stream';
        }

        // SSE streams are never timed out; non-streaming requests honor config.timeoutMs.
        const timeoutMs = stream ? undefined : this.config.timeoutMs;
        let requestSignal = signal;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        if (timeoutMs && timeoutMs > 0) {
            const controller = new AbortController();
            requestSignal = controller.signal;
            if (signal) {
                if (signal.aborted) {
                    controller.abort();
                } else {
                    signal.addEventListener('abort', () => controller.abort(), { once: true });
                }
            }
            timeoutHandle = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        }

        let response: Response;
        try {
            response = await this.fetchFn(joinUrl(this.config.baseUrl, path), {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: requestSignal,
            });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                if (timedOut) {
                    throw new EngineUnavailableError(`Request to ${path} timed out after ${timeoutMs}ms`, { timedOut: true, cause: error as Error });
                }
                throw new EngineError('aborted', `Request aborted: ${path}`);
            }
            throw new EngineUnavailableError(`Network error for ${path}: ${(error as Error).message}`, { cause: error as Error });
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        }
        if (!response.ok) {
            let errorBody: unknown = undefined;
            try {
                errorBody = await response.clone().json();
            } catch {
                try {
                    errorBody = await response.clone().text();
                } catch {
                    errorBody = undefined;
                }
            }
            const retryAfter = Number(response.headers.get('Retry-After'));
            throw engineErrorFromStatus(response.status, `HTTP ${response.status} for ${path}`, {
                body: errorBody,
                ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
            });
        }
        return response;
    }
}

export function parseSseChunk(chunk: string): SorikuSseEvent | undefined {
    const dataLines: string[] = [];
    for (const line of chunk.split('\n')) {
        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    }
    if (dataLines.length === 0) {
        return undefined;
    }
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
        return { type: 'done' };
    }
    try {
        const parsed = JSON.parse(payload) as SorikuSseEvent;
        if (!parsed.type) {
            return { type: 'unknown', payload: parsed };
        }
        return parsed;
    } catch (error) {
        throw new EngineError('parse', `Invalid SSE JSON: ${payload}`, { cause: error as Error });
    }
}
