/********************************************************************************
 * Soriku IDE — HTTP + SSE transport (testable, no Theia deps)
 ********************************************************************************/

import { EngineError } from './engine-errors';
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

    async *postSse(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent> {
        const response = await this.rawRequest('POST', path, body, true, signal);
        if (!response.body) {
            throw new EngineError('network', `SSE response has no body for ${path}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');
                while (boundary >= 0) {
                    const rawEvent = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const parsed = parseSseChunk(rawEvent);
                    if (parsed) {
                        yield parsed;
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }
            if (buffer.trim()) {
                const parsed = parseSseChunk(buffer);
                if (parsed) {
                    yield parsed;
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private async rawRequest(method: string, path: string, body: unknown | undefined, stream: boolean, signal?: AbortSignal): Promise<Response> {
        const headers = buildAuthHeaders(this.config);
        if (stream) {
            headers['Accept'] = 'text/event-stream';
        }
        let response: Response;
        try {
            response = await this.fetchFn(joinUrl(this.config.baseUrl, path), {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal,
            });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new EngineError('aborted', `Request aborted: ${path}`);
            }
            throw new EngineError('network', `Network error for ${path}: ${(error as Error).message}`, { cause: error as Error });
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
            throw new EngineError('http', `HTTP ${response.status} for ${path}`, { status: response.status, body: errorBody });
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
