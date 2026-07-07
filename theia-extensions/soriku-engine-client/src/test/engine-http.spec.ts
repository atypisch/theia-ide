/********************************************************************************
 * Soriku IDE — EngineHttpTransport unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    AuthError,
    EndpointError,
    EngineError,
    EngineUnavailableError,
    RateLimitError,
    StreamInterruptedError,
} from '../common/engine-errors';
import {
    EngineHttpTransport,
    FetchFn,
    buildAuthHeaders,
    joinUrl,
    normalizeBaseUrl,
    parseSseChunk,
} from '../common/engine-http';
import { EngineClientConfig } from '../common/engine-types';

const BASE_CONFIG: EngineClientConfig = {
    baseUrl: 'http://127.0.0.1:8765',
    authToken: 'test-token',
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchFn {
    return (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(handler(url, init));
    };
}

/** A fetch that never resolves on its own; it only rejects (AbortError) when its signal aborts. */
function neverResolvingFetch(): FetchFn {
    return (_input, init) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const fail = () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        };
        if (signal) {
            if (signal.aborted) {
                fail();
            } else {
                signal.addEventListener('abort', fail, { once: true });
            }
        }
    });
}

function sseResponse(body?: BodyInit): Response {
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(stream: AsyncGenerator<{ type: string; [k: string]: unknown }>): Promise<{ type: string; [k: string]: unknown }[]> {
    const events = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}

describe('engine-http utilities', () => {
    it('normalizeBaseUrl strips trailing slashes', () => {
        assert.equal(normalizeBaseUrl('http://localhost:8765/'), 'http://localhost:8765');
    });

    it('joinUrl composes paths', () => {
        assert.equal(joinUrl('http://localhost:8765/', '/api/health'), 'http://localhost:8765/api/health');
    });

    it('buildAuthHeaders includes bearer token when set', () => {
        const headers = buildAuthHeaders(BASE_CONFIG);
        assert.equal(headers['Authorization'], 'Bearer test-token');
    });

    it('buildAuthHeaders omits bearer when token absent', () => {
        const headers = buildAuthHeaders({ baseUrl: BASE_CONFIG.baseUrl });
        assert.equal(headers['Authorization'], undefined);
    });

    it('buildAuthHeaders includes X-Soriku-Group when a group is active', () => {
        const headers = buildAuthHeaders({ ...BASE_CONFIG, groupId: 'grp_1' });
        assert.equal(headers['X-Soriku-Group'], 'grp_1');
    });

    it('buildAuthHeaders omits X-Soriku-Group when no group is set', () => {
        const headers = buildAuthHeaders(BASE_CONFIG);
        assert.equal(headers['X-Soriku-Group'], undefined);
    });
});

describe('parseSseChunk', () => {
    it('parses typed SSE JSON events', () => {
        const event = parseSseChunk('data: {"type":"meta","model":"auto"}\n');
        assert.equal(event?.type, 'meta');
        assert.equal(event?.model, 'auto');
    });

    it('maps [DONE] to done event', () => {
        const event = parseSseChunk('data: [DONE]\n');
        assert.equal(event?.type, 'done');
    });

    it('wraps untyped JSON payloads as unknown', () => {
        const event = parseSseChunk('data: {"foo":1}\n');
        assert.equal(event?.type, 'unknown');
    });

    it('throws EngineError on invalid JSON', () => {
        assert.throws(() => parseSseChunk('data: {not json}\n'), (e: EngineError) => e.code === 'parse');
    });
});

describe('EngineHttpTransport — JSON requests', () => {
    it('getJson calls health endpoint', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch((url, init) => {
            assert.equal(url, 'http://127.0.0.1:8765/api/health');
            assert.equal(init?.method, 'GET');
            return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }));
        const health = await transport.getJson<{ status: string }>('/api/health');
        assert.equal(health.status, 'ok');
    });

    it('listAgents uses v1 envelope path', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(url => {
            assert.ok(url.endsWith('/api/v1/agents'));
            return new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 });
        }));
        const result = await transport.getJson<{ data: unknown[]; total: number }>('/api/v1/agents');
        assert.deepEqual(result, { data: [], total: 0 });
    });

    it('patchJson sends agent update body', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch((url, init) => {
            assert.ok(url.endsWith('/api/v1/agents/agent-1'));
            assert.equal(init?.method, 'PATCH');
            assert.equal(init?.body, JSON.stringify({ system_prompt: 'updated' }));
            return new Response(JSON.stringify({ data: { id: 'agent-1', name: 'A' } }), { status: 200 });
        }));
        const result = await transport.patchJson<{ data: { id: string } }>('/api/v1/agents/agent-1', { system_prompt: 'updated' });
        assert.equal(result.data.id, 'agent-1');
    });

    it('postJson sends confirm request', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch((url, init) => {
            assert.ok(url.endsWith('/api/worker/confirm'));
            assert.equal(init?.method, 'POST');
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }));
        const result = await transport.postJson<{ ok: boolean }>('/api/worker/confirm', {
            confirmation_id: 'cid',
            approved: true,
        });
        assert.equal(result.ok, true);
    });

    it('returns undefined for 204 No Content', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => new Response(undefined, { status: 204 })));
        const result = await transport.deleteJson('/api/routing/overrides/x');
        assert.equal(result, undefined);
    });
});

describe('EngineHttpTransport — typed errors', () => {
    function statusTransport(status: number, headers?: Record<string, string>): EngineHttpTransport {
        return new EngineHttpTransport(BASE_CONFIG, mockFetch(() =>
            new Response(JSON.stringify({ error: 'x' }), { status, headers })
        ));
    }

    it('401 maps to AuthError', async () => {
        await assert.rejects(() => statusTransport(401).getJson('/api/v1/agents'),
            (e: EngineError) => e instanceof AuthError && e.code === 'http' && e.status === 401);
    });

    it('403 maps to AuthError', async () => {
        await assert.rejects(() => statusTransport(403).getJson('/api/v1/agents'),
            (e: EngineError) => e instanceof AuthError && e.status === 403);
    });

    it('429 maps to RateLimitError with Retry-After', async () => {
        await assert.rejects(() => statusTransport(429, { 'Retry-After': '12' }).getJson('/api/worker'),
            (e: RateLimitError) => e instanceof RateLimitError && e.retryAfterSeconds === 12);
    });

    it('404 maps to EndpointError', async () => {
        await assert.rejects(() => statusTransport(404).getJson('/api/v1/agents/missing'),
            (e: EngineError) => e instanceof EndpointError && e.status === 404);
    });

    it('500 maps to EndpointError', async () => {
        await assert.rejects(() => statusTransport(500).getJson('/api/capabilities'),
            (e: EngineError) => e instanceof EndpointError && e.status === 500);
    });

    it('network failure maps to EngineUnavailableError (not timed out)', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, () => Promise.reject(new Error('ECONNREFUSED')));
        await assert.rejects(() => transport.getJson('/api/health'),
            (e: EngineUnavailableError) => e instanceof EngineUnavailableError && e.code === 'network' && e.timedOut === false);
    });

    it('parse failure on malformed JSON body maps to EngineError parse', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => new Response('{not json', { status: 200 })));
        await assert.rejects(() => transport.getJson('/api/health'), (e: EngineError) => e.code === 'parse');
    });
});

describe('EngineHttpTransport — timeout', () => {
    it('non-streaming request times out as EngineUnavailableError(timedOut)', async () => {
        const transport = new EngineHttpTransport({ ...BASE_CONFIG, timeoutMs: 10 }, neverResolvingFetch());
        await assert.rejects(() => transport.getJson('/api/health'),
            (e: EngineUnavailableError) => e instanceof EngineUnavailableError && e.timedOut === true && e.code === 'timeout');
    });

    it('caller abort maps to aborted (not timeout)', async () => {
        const controller = new AbortController();
        const transport = new EngineHttpTransport({ ...BASE_CONFIG, timeoutMs: 5000 }, neverResolvingFetch());
        controller.abort();
        await assert.rejects(() => transport.postSse('/api/worker', { stream: true }, controller.signal).next(),
            (e: EngineError) => e.code === 'aborted');
    });
});

describe('EngineHttpTransport — SSE streaming', () => {
    it('yields parsed worker events in order', async () => {
        const body = 'data: {"type":"meta","model":"local-model"}\n\ndata: {"type":"chunk","content":"hi"}\n\n';
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch((url, init) => {
            assert.ok(url.endsWith('/api/worker'));
            assert.equal(init?.method, 'POST');
            return sseResponse(body);
        }));
        const events = await collect(transport.postSse('/api/worker', { prompt: 'hello', stream: true }));
        assert.equal(events.length, 2);
        assert.equal(events[0].type, 'meta');
        assert.equal(events[1].type, 'chunk');
    });

    it('flushes a trailing frame without a final blank line (early close)', async () => {
        const body = 'data: {"type":"chunk","content":"partial"}';
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => sseResponse(body)));
        const events = await collect(transport.postSse('/api/worker', {}));
        assert.equal(events.length, 1);
        assert.equal(events[0].content, 'partial');
    });

    it('surfaces a malformed frame as a transport_error event (not engine error) and continues (#3)', async () => {
        const body = 'data: {bad json}\n\ndata: {"type":"chunk","content":"ok"}\n\n';
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => sseResponse(body)));
        const events = await collect(transport.postSse('/api/worker', {}));
        assert.equal(events.length, 2);
        assert.equal(events[0].type, 'transport_error');
        assert.equal(events[0].code, 'malformed_sse');
        assert.equal(events[1].type, 'chunk');
    });

    it('aborts a byte-silent stream via the idle watchdog (#4)', async () => {
        // A stream that sends one chunk then goes silent forever (no close, no bytes).
        const transport = new EngineHttpTransport(
            { ...BASE_CONFIG, sseIdleTimeoutMs: 50 },
            mockFetch(() => sseResponse(new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(new TextEncoder().encode('data: {"type":"chunk","content":"a"}\n\n'));
                    // never enqueue again, never close — a hung engine
                },
            }))),
        );
        const received: string[] = [];
        await assert.rejects(async () => {
            for await (const event of transport.postSse('/api/worker', {})) {
                received.push(event.type);
            }
        }, (e: EngineError) => e instanceof StreamInterruptedError && /idle/.test(e.message));
        assert.deepEqual(received, ['chunk']);   // the pre-hang chunk still arrived
    });

    it('cancels the response body when the consumer exits early (#6)', async () => {
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
            start(controller): void {
                controller.enqueue(new TextEncoder().encode('data: {"type":"chunk","content":"a"}\n\n'));
                controller.enqueue(new TextEncoder().encode('data: {"type":"chunk","content":"b"}\n\n'));
            },
            cancel(): void {
                cancelled = true;
            },
        });
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => sseResponse(stream)));
        const iterator = transport.postSse('/api/worker', {});
        await iterator.next();               // consume one event…
        await iterator.return(undefined);    // …then bail out (widget closed)
        assert.equal(cancelled, true);       // the HTTP body was cancelled, not just unlocked
    });

    it('throws StreamInterruptedError when the response has no body', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => sseResponse()));
        await assert.rejects(() => transport.postSse('/api/worker', {}).next(),
            (e: EngineError) => e instanceof StreamInterruptedError);
    });

    it('throws StreamInterruptedError when the stream errors mid-flight', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(new TextEncoder().encode('data: {"type":"chunk","content":"a"}\n\n'));
                    controller.error(new Error('connection dropped'));
                },
            });
            return sseResponse(stream);
        }));
        await assert.rejects(async () => { await collect(transport.postSse('/api/worker', {})); },
            (e: EngineError) => e instanceof StreamInterruptedError && e.code === 'stream');
    });

    it('SSE error responses still map to typed HTTP errors', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() =>
            new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
        ));
        await assert.rejects(() => transport.postSse('/api/worker', {}).next(),
            (e: EngineError) => e instanceof AuthError);
    });
});
