#!/usr/bin/env node
/*
 * Soriku IDE — a tiny scripted engine for end-to-end checks of the IDE without a model.
 *
 *   node scripts/mock-engine.mjs --port 8799 --script guard
 *
 * It answers the few GETs the IDE needs at startup and, for POST /api/worker, plays a fixed
 * script of `tool_request` events — waiting for the IDE's /api/worker/confirm after each one —
 * so the IDE's own handling (guard, approvals, checkpoints, timeline) can be asserted exactly.
 * `GET /__log` returns what the IDE answered. Binds to 127.0.0.1 only. No dependencies.
 *
 * SPDX-License-Identifier: MIT
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const PORT = Number(opt('port', '8799'));
const SCRIPT = opt('script', 'guard');

// Secret-shaped strings are assembled at runtime so this file never contains a real-looking token.
const FAKE_TOKEN = `ghp_${'A1b2C3d4E5'.repeat(4)}`;

const ANSWERS = { claim: 'Created `router.php` with the specified content.' };

const SCRIPTS = {
    // A model that claims work it never did: no tool call at all.
    claim: [],
    // Each step is a tool call the "model" makes. `expect` documents what the guard must do.
    guard: [
        { tool: 'file_write', args: { path: '.vscode/tasks.json', content: '{"tasks":[{"label":"build","runOptions":{"runOn":"folderOpen"}}]}' }, expect: 'deny' },
        { tool: 'file_write', args: { path: '.github/workflows/audit.yml', content: 'name: audit\n' }, expect: 'deny' },
        { tool: 'file_write', args: { path: 'src/config.ts', content: `export const key = "${FAKE_TOKEN}";\n` }, expect: 'deny' },
        { tool: 'file_write', args: { path: '/etc/soriku-test.txt', content: 'x' }, expect: 'deny' },
        { tool: 'shell_exec', args: { command: 'bash -c "echo hi"' }, expect: 'deny' },
        { tool: 'shell_exec', args: { command: 'git push origin master' }, expect: 'deny' },
        { tool: 'file_read', args: { path: '.env' }, expect: 'confirm' },
        { tool: 'file_write', args: { path: 'src/ok.ts', content: 'export const ok = 1;\n' }, expect: 'allow' },
    ],
};

const pending = new Map();      // request_id -> resolve(result)
const log = [];                 // what the IDE answered

const json = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};

function readBody(req) {
    return new Promise(resolve => {
        let data = '';
        req.on('data', c => { data += c; });
        req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    });
}

async function playScript(res) {
    const send = e => res.write(`data: ${JSON.stringify(e)}\n\n`);
    send({ type: 'meta', model: 'mock-model', role: 'pilot', conversation_id: randomUUID() });
    let iteration = 0;
    for (const step of SCRIPTS[SCRIPT] ?? []) {
        const requestId = randomUUID();
        iteration += 1;
        const answered = new Promise(resolve => pending.set(requestId, resolve));
        // The real engine sends `args` as an object.
        send({ type: 'tool_request', request_id: requestId, tool: step.tool, args: step.args, iteration });
        send({ type: 'tool_call', tool: step.tool, args: step.args, iteration });
        // The IDE may ask the user (confirm) — nobody is there in an automated run, so give up after a while.
        const result = await Promise.race([answered, new Promise(r => setTimeout(() => r({ timedOut: true }), 20000))]);
        log.push({ tool: step.tool, target: step.args.path ?? step.args.command, expect: step.expect, answer: result });
        send({ type: 'tool_result', tool: step.tool, result: result?.result ?? result?.error ?? '', iteration });
    }
    send({ type: 'answer', content: ANSWERS[SCRIPT] ?? 'Script finished.' });
    send({ type: 'done', iterations: iteration, steps: iteration, total_ms: 1, model: 'mock-model', input_tokens: 0, output_tokens: 0, cost_eur: 0, is_local: true });
    res.end();
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const path = new URL(req.url, 'http://x').pathname;

    if (req.method === 'POST' && path === '/api/worker') {
        await readBody(req);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        playScript(res).catch(() => res.end());
        return;
    }
    if (req.method === 'POST' && path === '/api/worker/confirm') {
        const body = await readBody(req);
        pending.get(body.confirmation_id)?.(body.result ?? { approved: body.approved });
        pending.delete(body.confirmation_id);
        json(res, { status: 'ok' });
        return;
    }
    if (path === '/__log') { json(res, log); return; }
    if (path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const t = setInterval(() => res.write(': keepalive\n\n'), 15000);
        req.on('close', () => clearInterval(t));
        return;
    }
    if (path === '/api/health') { json(res, { status: 'ok', models: ['mock-model'] }); return; }
    if (path === '/api/auth/mode') { json(res, { mode: 'local' }); return; }
    if (path === '/api/v1/agents') {
        json(res, { data: [{ id: 'koda', name: 'Koda', role: 'generalist', category: 'coding', version: 1, persona: { description: 'Mock agent' } }] });
        return;
    }
    if (path === '/api/v1/models') { json(res, { object: 'list', data: [{ id: 'mock-model', is_local: true }] }); return; }
    if (path === '/api/models/installed') { json(res, { models: [{ id: 'mock-model', name: 'mock-model', is_running: true }] }); return; }
    if (path === '/api/providers') { json(res, { providers: [] }); return; }
    if (path === '/api/conversations') { json(res, []); return; }
    json(res, {});
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock engine on http://127.0.0.1:${PORT} (script: ${SCRIPT})`));
