/********************************************************************************
 * Soriku IDE — chat model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { AssistantTurn, busyPhase, createAssistantTurn, fromEngineMessages, reduceSseEvent } from '../common/chat-model';

function fold(events: SorikuSseEvent[]): AssistantTurn {
    return events.reduce(reduceSseEvent, createAssistantTurn('t1'));
}

describe('reduceSseEvent', () => {
    it('captures the model and responder from meta (transparency)', () => {
        const turn = fold([
            { type: 'meta', model: 'model-x', responded_by: 'Pilot', conversation_id: 'c1' },
        ]);
        assert.equal(turn.model, 'model-x');
        assert.equal(turn.respondedBy, 'Pilot');
        assert.equal(turn.conversationId, 'c1');
    });

    it('accumulates chunk content in order', () => {
        const turn = fold([
            { type: 'chunk', content: 'Hello' },
            { type: 'chunk', content: ', world' },
        ]);
        assert.equal(turn.text, 'Hello, world');
    });

    it('updates the model on model_switch and routing', () => {
        const turn = fold([
            { type: 'meta', model: 'first' },
            { type: 'model_switch', to: 'second' },
        ]);
        assert.equal(turn.model, 'second');
    });

    it('records a tool call and resolves it on tool_result', () => {
        const turn = fold([
            { type: 'tool_call', tool: 'file_read', call_id: 'k1', args: { path: 'a.ts' } },
            { type: 'tool_result', call_id: 'k1', result: { ok: true } },
        ]);
        assert.equal(turn.toolCalls.length, 1);
        assert.equal(turn.toolCalls[0].tool, 'file_read');
        assert.equal(turn.toolCalls[0].status, 'done');
        assert.deepEqual(turn.toolCalls[0].result, { ok: true });
    });

    it('marks confirm_tool calls as requested', () => {
        const turn = fold([
            { type: 'confirm_tool', tool: 'file_write', confirmation_id: 'c9', args: { path: 'b.ts' } },
        ]);
        assert.equal(turn.toolCalls[0].status, 'requested');
        assert.equal(turn.toolCalls[0].callId, 'c9');
    });

    it('finishes on done', () => {
        const turn = fold([{ type: 'chunk', content: 'hi' }, { type: 'done' }]);
        assert.equal(turn.status, 'done');
    });

    it('captures an error event', () => {
        const turn = fold([{ type: 'error', content: 'boom' }]);
        assert.equal(turn.status, 'error');
        assert.equal(turn.error, 'boom');
        assert.notEqual(turn.status, 'done');
    });

    it('does not mutate the input turn (immutability)', () => {
        const start = createAssistantTurn('t');
        const after = reduceSseEvent(start, { type: 'chunk', content: 'x' });
        assert.equal(start.text, '');
        assert.equal(after.text, 'x');
        assert.notEqual(start, after);
    });

    it('prefers a final answer block when provided', () => {
        const turn = fold([
            { type: 'chunk', content: 'partial' },
            { type: 'answer', content: 'final answer' },
        ]);
        assert.equal(turn.text, 'final answer');
    });

    it('resolves a tool_result without an id against the last running call', () => {
        const turn = fold([
            { type: 'tool_call', tool: 'list_directory', args: { path: '.' } },
            { type: 'tool_result', tool: 'list_directory', result: 'f a.ts' },
        ]);
        assert.equal(turn.toolCalls.length, 1);
        assert.equal(turn.toolCalls[0].status, 'done');
        assert.equal(turn.toolCalls[0].result, 'f a.ts');
    });

    it('does not duplicate a delegated tool_request then its tool_call', () => {
        const turn = fold([
            { type: 'tool_request', request_id: 'r1', tool: 'file_read', args: { path: 'a.ts' } },
            { type: 'tool_call', tool: 'file_read', args: { path: 'a.ts' } },
            { type: 'tool_result', tool: 'file_read', result: 'contents' },
        ]);
        assert.equal(turn.toolCalls.length, 1);
        assert.equal(turn.toolCalls[0].status, 'done');
    });

    it('captures progress phase from a status event', () => {
        const turn = fold([{ type: 'status', content: 'Routing to a model' }]);
        assert.equal(turn.phase, 'Routing to a model');
    });

    it('renders a plan/ensemble answer from synthesis events and tracks worker models', () => {
        const turn = fold([
            { type: 'plan_generated' },
            { type: 'worker_start', worker_id: 'w1', model: 'qwen2.5-coder:7b' },
            { type: 'worker_start', worker_id: 'w2', model: 'gemma3:4b' },
            { type: 'synthesis_start' },
            { type: 'synthesis_chunk', chunk: 'Merged ' },
            { type: 'synthesis_chunk', chunk: 'answer.' },
            { type: 'synthesis_done', final_text: 'Merged answer.', synthesizer_model: 'deepseek-r1:7b' },
            { type: 'plan_done', final_response: 'Merged answer.' },
        ]);
        assert.equal(turn.text, 'Merged answer.');
        assert.equal(turn.model, 'deepseek-r1:7b');
        assert.deepEqual(turn.workers, ['qwen2.5-coder:7b', 'gemma3:4b']);
        assert.equal(turn.status, 'done');
    });

    it('marks a plan failure as an error', () => {
        const turn = fold([{ type: 'plan_failed', reason: 'no_model' }]);
        assert.equal(turn.status, 'error');
        assert.equal(turn.error, 'no_model');
    });

    it('captures a plan for approval and clears it once execution starts', () => {
        const awaiting = fold([
            { type: 'plan_generated', plan_id: 'pl_1', tasks: [{ id: 't1', role: 'researcher', goal: 'gather', preferred_model: 'qwen3:8b' }] },
            { type: 'plan_cost_estimated', estimated_cost_eur: 0.02 },
            { type: 'plan_awaiting_execution', plan_id: 'pl_1' },
        ]);
        assert.equal(awaiting.pendingPlan?.planId, 'pl_1');
        assert.equal(awaiting.pendingPlan?.tasks[0].model, 'qwen3:8b');
        assert.equal(awaiting.pendingPlan?.costEur, 0.02);
        assert.equal(awaiting.awaitingApproval, true);

        const running = reduceSseEvent(awaiting, { type: 'worker_start', model: 'qwen3:8b' });
        assert.equal(running.awaitingApproval, false);
    });

    it('treats a cancelled plan as a finished (non-error) turn', () => {
        const turn = fold([
            { type: 'plan_generated', plan_id: 'pl_2', tasks: [] },
            { type: 'plan_awaiting_execution', plan_id: 'pl_2' },
            { type: 'plan_cancelled', plan_id: 'pl_2' },
        ]);
        assert.equal(turn.awaitingApproval, false);
        assert.equal(turn.status, 'done');
    });
});

describe('fromEngineMessages', () => {
    it('maps user + assistant turns and keeps the model', () => {
        const msgs = fromEngineMessages([
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi there', model: 'qwen2.5-coder:7b' },
        ]);
        assert.equal(msgs.length, 2);
        assert.equal(msgs[0].role, 'user');
        assert.equal((msgs[0] as { text: string }).text, 'hello');
        const a = msgs[1] as AssistantTurn;
        assert.equal(a.role, 'assistant');
        assert.equal(a.text, 'hi there');
        assert.equal(a.model, 'qwen2.5-coder:7b');
        assert.equal(a.status, 'done');
    });
    it('skips empty assistant placeholders and non user/assistant roles', () => {
        const msgs = fromEngineMessages([
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'q' },
            { role: 'assistant', content: '' },
        ]);
        assert.equal(msgs.length, 1);
        assert.equal(msgs[0].role, 'user');
    });
});

describe('busyPhase', () => {
    it('reports thinking before any output', () => {
        assert.equal(busyPhase(createAssistantTurn('t')), 'Thinking…');
    });
    it('reports writing once text streams', () => {
        const turn = reduceSseEvent(createAssistantTurn('t'), { type: 'chunk', content: 'hi' });
        assert.equal(busyPhase(turn), 'Writing…');
    });
    it('reports the running tool', () => {
        const turn = reduceSseEvent(createAssistantTurn('t'), { type: 'tool_call', tool: 'list_directory' });
        assert.equal(busyPhase(turn), 'Running list_directory…');
    });
    it('reports awaiting approval for a confirm_tool', () => {
        const turn = reduceSseEvent(createAssistantTurn('t'), { type: 'confirm_tool', tool: 'file_write', confirmation_id: 'c1' });
        assert.equal(busyPhase(turn), 'Awaiting approval: file_write');
    });
});
