/********************************************************************************
 * Soriku IDE — EngineHttpTransport unit tests
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EngineError } from '../common/engine-errors';
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
});

describe('EngineHttpTransport', () => {
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

    it('throws EngineError on HTTP failure', async () => {
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch(() =>
            new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
        ));
        await assert.rejects(
            () => transport.getJson('/api/v1/agents/missing'),
            (error: EngineError) => error.code === 'http' && error.status === 404
        );
    });

    it('postSse yields parsed worker events', async () => {
        const sseBody = 'data: {"type":"meta","model":"qwen"}\n\ndata: {"type":"chunk","content":"hi"}\n\n';
        const transport = new EngineHttpTransport(BASE_CONFIG, mockFetch((url, init) => {
            assert.ok(url.endsWith('/api/worker'));
            assert.equal(init?.method, 'POST');
            return new Response(sseBody, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            });
        }));
        const events = [];
        for await (const event of transport.postSse('/api/worker', { prompt: 'hello', stream: true })) {
            events.push(event);
        }
        assert.equal(events.length, 2);
        assert.equal(events[0].type, 'meta');
        assert.equal(events[1].type, 'chunk');
    });
});
