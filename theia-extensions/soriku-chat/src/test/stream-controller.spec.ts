/********************************************************************************
 * Soriku IDE — chat stream controller tests (P4-a): the full send lifecycle,
 * driven with a fake engine stream — no DOM, no widget.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, EngineError, StreamInterruptedError } from 'soriku-engine-client-ext/lib/common/engine-errors';
import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { ChatStreamController, StreamRunOptions } from '../browser/chat-stream-controller';
import { AssistantTurn, createAssistantTurn } from '../common/chat-model';

function makeController(events: (SorikuSseEvent | Error)[]): {
    controller: ChatStreamController;
    executedPlans: string[];
    toolCalls: string[];
    run(over?: Partial<StreamRunOptions>): Promise<{ final: AssistantTurn; turns: AssistantTurn[] }>;
} {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new ChatStreamController() as any;
    const executedPlans: string[] = [];
    controller.engineClient = {
        chatStream: async function* (): AsyncGenerator<SorikuSseEvent> {
            for (const e of events) {
                if (e instanceof Error) {
                    throw e;
                }
                yield e;
            }
        },
        executePlan: async (id: string) => { executedPlans.push(id); },
    };
    const toolCalls: string[] = [];
    const tools = {
        confirm: async (e: SorikuSseEvent) => { toolCalls.push(`confirm:${e.type}`); },
        executeDelegated: async (e: SorikuSseEvent) => { toolCalls.push(`delegated:${String(e.request_id)}`); },
    };
    return {
        controller, executedPlans, toolCalls,
        async run(over = {}) {
            const turns: AssistantTurn[] = [];
            const final = await controller.run({
                params: { prompt: 'x', personaId: 'agent-1' },
                initialTurn: createAssistantTurn('t1'),
                needsApproval: false,
                tools,
                isDisposed: () => false,
                onTurn: (t: AssistantTurn) => turns.push(t),
                ...over,
            });
            return { final, turns };
        },
    };
}

describe('ChatStreamController.run', () => {
    it('folds a normal stream to done and reports every turn', async () => {
        const h = makeController([
            { type: 'chunk', content: 'hello ' },
            { type: 'chunk', content: 'world' },
            { type: 'done' },
        ]);
        const { final, turns } = await h.run();
        assert.equal(final.status, 'done');
        assert.equal(final.text, 'hello world');
        assert.equal(turns.length, 3);
        assert.equal(h.controller.active, false);   // lifecycle released
    });

    it('user stop (aborted) keeps the partial answer as done, never an error', async () => {
        const h = makeController([
            { type: 'chunk', content: 'partial' },
            new EngineError('aborted', 'SSE stream aborted'),
        ]);
        const { final } = await h.run();
        assert.equal(final.status, 'done');
        assert.equal(final.phase, 'stopped');
        assert.equal(final.text, 'partial');
    });

    it('user stop before any text streamed is still done+stopped with empty text (never renders as a silent blank bubble)', async () => {
        const h = makeController([
            new EngineError('aborted', 'SSE stream aborted'),
        ]);
        const { final } = await h.run();
        assert.equal(final.status, 'done');
        assert.equal(final.phase, 'stopped');
        assert.equal(final.text, '');
    });

    it('a transport drop marks the turn interrupted (retryable), text preserved (#5)', async () => {
        const h = makeController([
            { type: 'chunk', content: 'kept' },
            new StreamInterruptedError('connection dropped'),
        ]);
        const { final } = await h.run();
        assert.equal(final.status, 'interrupted');
        assert.equal(final.text, 'kept');
        assert.match(final.error ?? '', /dropped/);
    });

    it('an auth failure is actionable: error + authRequired (#14)', async () => {
        const h = makeController([new AuthError('HTTP 401', { status: 401 })]);
        const { final } = await h.run();
        assert.equal(final.status, 'error');
        assert.equal(final.authRequired, true);
    });

    it('plan mode never auto-executes and flags approval', async () => {
        const h = makeController([
            { type: 'plan_awaiting_execution', plan_id: 'p1' },
            { type: 'done' },
        ]);
        const { final } = await h.run({ needsApproval: true });
        assert.equal(final.planNeedsApproval, true);
        assert.deepEqual(h.executedPlans, []);
    });

    it('auto/edit mode auto-executes an approved plan', async () => {
        const h = makeController([
            { type: 'plan_awaiting_execution', plan_id: 'p2' },
            { type: 'done' },
        ]);
        await h.run({ needsApproval: false });
        assert.deepEqual(h.executedPlans, ['p2']);
    });

    it('fans confirm_tool and tool_request out to the executor', async () => {
        const h = makeController([
            { type: 'confirm_tool', confirmation_id: 'c1', tool: 'shell_exec' },
            { type: 'tool_request', request_id: 'r1', tool: 'file_read' },
            { type: 'done' },
        ]);
        await h.run();
        assert.deepEqual(h.toolCalls, ['confirm:confirm_tool', 'delegated:r1']);
    });

    it('stops touching state the moment the host is disposed (#2)', async () => {
        let disposed = false;
        const h = makeController([
            { type: 'chunk', content: 'a' },
            { type: 'chunk', content: 'b' },
            { type: 'chunk', content: 'c' },
        ]);
        const turns: AssistantTurn[] = [];
        await h.controller.run({
            params: { prompt: 'x', personaId: 'agent-1' },
            initialTurn: createAssistantTurn('t1'),
            needsApproval: false,
            tools: { confirm: async () => { /* */ }, executeDelegated: async () => { /* */ } },
            isDisposed: () => disposed,
            onTurn: (t: AssistantTurn) => { turns.push(t); disposed = turns.length >= 1; },
        });
        assert.equal(turns.length, 1);   // second/third chunk never reduced
    });
});
