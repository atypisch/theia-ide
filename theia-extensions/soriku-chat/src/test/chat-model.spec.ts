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

    it('surfaces a blocked file_write outcome from worker_tool_call', () => {
        const turn = fold([
            {
                type: 'worker_tool_call', tool: 'file_write', args: { path: 'x.html' },
                error: 'Incomplete deliverable: HTML file must contain real markup',
                outcome: 'blocked', outcome_reason: 'HTML file must contain real markup',
            },
        ]);
        assert.equal(turn.toolCalls.length, 1);
        assert.equal(turn.toolCalls[0].outcome, 'blocked');
        assert.equal(turn.toolCalls[0].outcomeReason, 'HTML file must contain real markup');
    });

    it('surfaces a salvaged outcome and still tracks the generated file', () => {
        const turn = fold([
            { type: 'worker_tool_call', tool: 'file_write', args: { path: 'app/x.php' }, outcome: 'salvaged', outcome_reason: 'recovered a file_read call from the body' },
        ]);
        assert.equal(turn.toolCalls[0].outcome, 'salvaged');
        assert.equal(turn.generatedFiles.length, 1);
        assert.equal(turn.generatedFiles[0].path, 'app/x.php');
    });

    it('leaves outcome undefined for a clean tool call', () => {
        const turn = fold([
            { type: 'worker_tool_call', tool: 'file_write', args: { path: 'ok.php' }, outcome: 'ok' },
        ]);
        assert.equal(turn.toolCalls[0].outcome, undefined);
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
    it('restores tool steps, workers and generated files from stored history', () => {
        const msgs = fromEngineMessages([
            { role: 'user', content: 'write file' },
            {
                role: 'assistant',
                content: 'done',
                model: 'qwen2.5-coder:7b',
                steps: [{ tool: 'file_write', args: { path: 'a.txt' }, result: 'ok' }],
                generated_files: [{ path: '/tmp/a.txt', filename: 'a.txt' }],
                workers: [{ model: 'qwen3.5:4b', status: 'done' }],
            },
        ]);
        assert.equal(msgs.length, 2);
        const a = msgs[1] as AssistantTurn;
        assert.equal(a.toolCalls.length, 1);
        assert.equal(a.toolCalls[0].tool, 'file_write');
        assert.equal(a.generatedFiles[0].path, '/tmp/a.txt');
        assert.deepEqual(a.workers, ['qwen3.5:4b']);
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

describe('worker_chunk and timing', () => {
    it('appends worker_chunk to turn text', () => {
        let turn = createAssistantTurn('t');
        turn = reduceSseEvent(turn, { type: 'worker_chunk', worker_id: 'w1', chunk: 'Hello ' });
        turn = reduceSseEvent(turn, { type: 'worker_chunk', worker_id: 'w1', chunk: 'world' });
        assert.equal(turn.text, 'Hello world');
    });
    it('records ttft from timing event', () => {
        const turn = reduceSseEvent(createAssistantTurn('t'), { type: 'timing', ttft_ms: 842 });
        assert.equal(turn.ttftMs, 842);
    });
    it('does not clear text on synthesis_start', () => {
        let turn = reduceSseEvent(createAssistantTurn('t'), { type: 'worker_chunk', chunk: 'worker output' });
        turn = reduceSseEvent(turn, { type: 'synthesis_start' });
        assert.equal(turn.text, 'worker output');
        assert.equal(turn.phase, 'Merging answers…');
    });
});
