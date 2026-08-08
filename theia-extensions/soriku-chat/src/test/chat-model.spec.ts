/********************************************************************************
 * Soriku IDE — chat model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import {
    AssistantTurn, busyPhase, capConversation, ChatMessage, createAssistantTurn, DEFAULT_RENDER_WINDOW,
    fromEngineMessages, MAX_CLIENT_MESSAGES, parseFileMentions, reduceSseEvent,
    roleLabel, SUBAGENT_ROLES, summarizeAgentInsights, visibleMessages, withWorkspacePrefix,
} from '../common/chat-model';

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

    it('builds a Fleet agent row from worker_start → tool_call → worker_done', () => {
        const turn = fold([
            { type: 'worker_start', worker_id: 'w1', task_id: 't1', model: 'qwen2.5-coder:7b', role: 'backend-developer', persona_id: 'koda', agent_name: 'Koda' },
            { type: 'worker_tool_call', worker_id: 'w1', tool: 'file_write', args: { path: 'api/x.php' }, outcome: 'ok' },
            { type: 'worker_tool_call', worker_id: 'w1', tool: 'file_write', args: { path: 'api/x.php' }, outcome: 'blocked', outcome_reason: 'bad' },
            { type: 'worker_done', worker_id: 'w1', task_id: 't1', result: { generated_files: [] } },
        ]);
        assert.equal(turn.agents.length, 1);
        const a = turn.agents[0];
        assert.equal(a.workerId, 'w1');
        assert.equal(a.role, 'backend-developer');
        assert.equal(a.model, 'qwen2.5-coder:7b');
        assert.equal(a.personaId, 'koda');
        assert.equal(a.agentName, 'Koda');
        assert.equal(a.status, 'done');
        assert.deepEqual(a.files, ['api/x.php']);
        assert.equal(a.corrections, 1);
    });

    it('captures parent_agent_id so minions nest under their head (Fase F)', () => {
        const turn = fold([
            { type: 'worker_start', worker_id: 'w1', task_id: 't1', role: 'generalist', persona_id: 'koda', agent_name: 'Koda' },
            {
                type: 'worker_start', worker_id: 'm1', task_id: 'minion-1', role: 'researcher',
                persona_id: 'agent-minion-koda-1', agent_name: 'minion-koda-1', parent_agent_id: 'koda',
            },
            { type: 'worker_done', worker_id: 'm1', task_id: 'minion-1', parent_agent_id: 'koda', result: { generated_files: [] } },
        ]);
        const head = turn.agents.find(a => a.workerId === 'w1');
        const minion = turn.agents.find(a => a.workerId === 'm1');
        assert.equal(head?.parentAgentId, undefined);
        assert.equal(minion?.parentAgentId, 'koda');
    });

    it('attaches a review_verdict to the reviewer agent row', () => {
        const turn = fold([
            { type: 'worker_start', worker_id: 'w2', task_id: 't2', role: 'code-reviewer', model: 'deepseek-r1:7b' },
            { type: 'review_verdict', worker_id: 'w2', task_id: 't2', target_task_id: 't1', status: 'changes_requested', notes: 'fixed a bug' },
        ]);
        const a = turn.agents.find(x => x.workerId === 'w2');
        assert.equal(a?.verdict?.status, 'changes_requested');
        assert.equal(a?.verdict?.notes, 'fixed a bug');
    });

    it('attaches a task_rework badge to the reviewer row, keyed by reviewer_task_id not worker_id', () => {
        const turn = fold([
            { type: 'worker_start', worker_id: 'w1', task_id: 't1', role: 'backend-developer' },
            { type: 'worker_start', worker_id: 'w2', task_id: 't2', role: 'code-reviewer' },
            { type: 'review_verdict', worker_id: 'w2', task_id: 't2', target_task_id: 't1', status: 'changes_requested', notes: 'fixed a bug' },
            { type: 'task_rework', task_id: 't1', reviewer_task_id: 't2', reason: 'fixed a bug', attempt: 1 },
        ]);
        const reviewer = turn.agents.find(x => x.workerId === 'w2');
        const target = turn.agents.find(x => x.workerId === 'w1');
        assert.equal(reviewer?.rework?.targetTaskId, 't1');
        assert.equal(reviewer?.rework?.reason, 'fixed a bug');
        assert.equal(reviewer?.rework?.attempt, 1);
        assert.equal(target?.rework, undefined);  // badge lives on the reviewer's row, not the target's
    });

    it('ignores a task_rework event when no Fleet row matches its reviewer_task_id yet', () => {
        const turn = fold([
            { type: 'task_rework', task_id: 't1', reviewer_task_id: 't2', reason: 'x', attempt: 1 },
        ]);
        assert.equal(turn.agents.length, 0);  // no crash, no phantom row created
    });

    it('tracks two workers in parallel as distinct Fleet rows', () => {
        const turn = fold([
            { type: 'worker_start', worker_id: 'w1', task_id: 't1', model: 'qwen2.5-coder:7b', role: 'backend-developer' },
            { type: 'worker_start', worker_id: 'w2', task_id: 't2', model: 'deepseek-r1:7b', role: 'code-reviewer' },
            { type: 'worker_done', worker_id: 'w1', result: {} },
        ]);
        assert.equal(turn.agents.length, 2);
        assert.equal(turn.agents.find(a => a.workerId === 'w1')?.status, 'done');
        assert.equal(turn.agents.find(a => a.workerId === 'w2')?.status, 'running');
    });

    it('captures an escalation event for the chip', () => {
        const turn = fold([
            { type: 'escalation', from: 'ollama:qwen2.5-coder:7b', to: 'groq:kimi-k2', reason: 'conductor_fallback' },
        ]);
        assert.equal(turn.escalation?.from, 'ollama:qwen2.5-coder:7b');
        assert.equal(turn.escalation?.to, 'groq:kimi-k2');
        assert.equal(turn.escalation?.reason, 'conductor_fallback');
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

    it('renders a plan answer from synthesis events and tracks worker models', () => {
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
        assert.equal(awaiting.planId, 'pl_1');

        const running = reduceSseEvent(awaiting, { type: 'worker_start', model: 'qwen3:8b' });
        assert.equal(running.awaitingApproval, false);
        assert.equal(running.planId, 'pl_1', 'planId must survive later events in the same run');
    });

    it('captures the plan_document markdown alongside the task list', () => {
        const turn = fold([
            { type: 'plan_generated', plan_id: 'pl_doc', tasks: [{ id: 't1', role: 'researcher', goal: 'gather' }], plan_document: '## Context\nx\n\n## Approach\ny' },
        ]);
        assert.equal(turn.pendingPlan?.document, '## Context\nx\n\n## Approach\ny');
    });

    it('leaves the plan document undefined for an older engine that omits it (back-compat)', () => {
        const turn = fold([
            { type: 'plan_generated', plan_id: 'pl_nodoc', tasks: [{ id: 't1', role: 'researcher', goal: 'gather' }] },
        ]);
        assert.equal(turn.pendingPlan?.document, undefined);
    });

    it('plan_cost_estimated still merges onto a documented plan', () => {
        const turn = fold([
            { type: 'plan_generated', plan_id: 'pl_doc2', tasks: [], plan_document: '## Context\nx' },
            { type: 'plan_cost_estimated', estimated_cost_eur: 0.05 },
        ]);
        assert.equal(turn.pendingPlan?.document, '## Context\nx');
        assert.equal(turn.pendingPlan?.costEur, 0.05);
    });

    it('plan_drafts sets a "comparing" phase without touching the pending plan', () => {
        const turn = fold([
            { type: 'plan_drafts', models: ['m1', 'm2'], winner_model: 'm2', draft_count: 2, reason: 'more thorough' },
        ]);
        assert.equal(turn.phase, 'Comparing 2 plan drafts…');
        assert.equal(turn.pendingPlan, undefined);
    });

    it('plan_drafts does not corrupt a turn already in progress', () => {
        const turn = fold([
            { type: 'plan_drafts', draft_count: 3 },
            { type: 'plan_generated', plan_id: 'pl_after_drafts', tasks: [], plan_document: '## Context\nz' },
        ]);
        assert.equal(turn.phase, 'Planning…');
        assert.equal(turn.pendingPlan?.planId, 'pl_after_drafts');
        assert.equal(turn.pendingPlan?.document, '## Context\nz');
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
    it('hydrates a user message\'s images from stored history, detecting mime type', () => {
        const msgs = fromEngineMessages([
            { role: 'user', content: 'what is this?', images: ['iVBORw0KGgoAAAANSUhEUgAA'] },
        ]);
        const user = msgs[0] as { images?: { base64: string; mimeType: string }[] };
        assert.equal(user.images?.length, 1);
        assert.equal(user.images?.[0].base64, 'iVBORw0KGgoAAAANSUhEUgAA');
        assert.equal(user.images?.[0].mimeType, 'image/png');
    });
    it('leaves images undefined when the stored message has none', () => {
        const msgs = fromEngineMessages([{ role: 'user', content: 'hi', images: [] }]);
        const user = msgs[0] as { images?: unknown };
        assert.equal(user.images, undefined);
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

describe('summarizeAgentInsights', () => {
    it('extracts top patterns, rules, anti-patterns, specializations, interactions', () => {
        const persona = {
            specializations: [{ name: 'php' }, { name: 'frontend' }],
            memory: { decision_patterns: { patterns: { php: 0.9, react: 0.3, mysql: 0.6 } } },
            intelligence: { domain_rules: ['always validate input', { rule: 'use PDO' }], anti_patterns: ['no eval'] },
            stats: { interactions: 42 },
        } as unknown as Parameters<typeof summarizeAgentInsights>[0];
        const ins = summarizeAgentInsights(persona);
        assert.deepEqual(ins.topPatterns.map(p => p.keyword), ['php', 'mysql', 'react']);
        assert.deepEqual(ins.domainRules, ['always validate input', 'use PDO']);
        assert.deepEqual(ins.antiPatterns, ['no eval']);
        assert.deepEqual(ins.specializations, ['php', 'frontend']);
        assert.equal(ins.interactions, 42);
    });

    it('handles a flat decision_patterns map and missing fields', () => {
        const persona = {
            specializations: [],
            memory: { decision_patterns: { php: 0.5, js: 0.7 } },
            intelligence: {},
            stats: {},
        } as unknown as Parameters<typeof summarizeAgentInsights>[0];
        const ins = summarizeAgentInsights(persona);
        assert.deepEqual(ins.topPatterns.map(p => p.keyword), ['js', 'php']);
        assert.deepEqual(ins.domainRules, []);
        assert.equal(ins.interactions, undefined);
    });
});

describe('reduceSseEvent — transport_error is non-terminal (#3)', () => {
    it('skips a malformed frame and keeps streaming', () => {
        const turn = [
            { type: 'chunk', content: 'hello ' },
            { type: 'transport_error', code: 'malformed_sse', message: 'Invalid SSE JSON' },
            { type: 'chunk', content: 'world' },
            { type: 'done' },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        assert.equal(turn.status, 'done');            // NOT flipped to error by the bad frame
        assert.equal(turn.text, 'hello world');       // both chunks survived
        assert.equal(turn.error, undefined);
    });
    it('keeps real engine errors terminal', () => {
        const turn = [
            { type: 'chunk', content: 'x' },
            { type: 'error', message: 'model exploded' },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        assert.equal(turn.status, 'error');
        assert.equal(turn.error, 'model exploded');
    });
});

describe('reduceSseEvent — worker-scoped tool attribution (#7/#8)', () => {
    it('binds interleaved same-name results to the right worker', () => {
        const turn = [
            { type: 'worker_tool_call', worker_id: 'w1', tool: 'file_write', args: { path: 'a.ts' }, outcome: 'verified' },
            { type: 'worker_tool_call', worker_id: 'w2', tool: 'file_write', args: { path: 'b.ts' }, outcome: 'blocked', outcome_reason: 'parse_gate' },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        assert.equal(turn.toolCalls.length, 2);                     // no cross-worker merge
        const w1 = turn.toolCalls.find(c => c.workerId === 'w1');
        const w2 = turn.toolCalls.find(c => c.workerId === 'w2');
        assert.equal(w1?.outcome, 'verified');                      // outcomes on the RIGHT cards
        assert.equal(w2?.outcome, 'blocked');
        assert.equal(w2?.outcomeReason, 'parse_gate');
    });

    it('a worker event adopts the unowned tool_request entry instead of duplicating (#8)', () => {
        const turn = [
            { type: 'tool_request', request_id: 'r1', tool: 'file_write', args: { path: 'a.ts' } },
            { type: 'worker_tool_call', worker_id: 'w1', tool: 'file_write', args: { path: 'a.ts' } },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        assert.equal(turn.toolCalls.length, 1);                     // merged, not duplicated
        assert.equal(turn.toolCalls[0].workerId, 'w1');             // ownership claimed
        assert.equal(turn.toolCalls[0].status, 'done');
    });

    it('a worker never claims an entry OWNED by another worker', () => {
        const turn = [
            { type: 'worker_tool_call', worker_id: 'w1', tool: 'shell_exec', args: { command: 'x' }, error: 'boom' },
            { type: 'tool_result', worker_id: 'w2', tool: 'shell_exec', result: 'w2 output' },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        // w2's result had no matching w2/unowned entry → it must NOT overwrite w1's card.
        const w1 = turn.toolCalls.find(c => c.workerId === 'w1');
        assert.notEqual(w1?.result, 'w2 output');
    });

    it('single-agent path (no worker_id anywhere) keeps matching as before', () => {
        const turn = [
            { type: 'tool_call', tool: 'file_read', args: { path: 'a.ts' } },
            { type: 'tool_result', tool: 'file_read', result: 'content' },
        ].reduce(reduceSseEvent, createAssistantTurn('t1'));
        assert.equal(turn.toolCalls.length, 1);
        assert.equal(turn.toolCalls[0].status, 'done');
        assert.equal(turn.toolCalls[0].result, 'content');
    });
});

describe('withWorkspacePrefix (C-B workspace format fix)', () => {
    it('prefixes the exact Workspace: line the engine extractors grep', () => {
        const out = withWorkspacePrefix('fix the bug', '/Users/x/proj');
        assert.equal(out, 'Workspace: /Users/x/proj\n\nfix the bug');
        // the engine-side patterns (workspace_learnings/file_write_guard/agent_loop)
        assert.match(out, /workspace:\s*([^\s\n]+)/i);
    });

    it('is a no-op without a workspace root', () => {
        assert.equal(withWorkspacePrefix('hello', undefined), 'hello');
        assert.equal(withWorkspacePrefix('hello', '   '), 'hello');
    });

    it('does not double-prefix an already-prefixed prompt (retry of stored text)', () => {
        const once = withWorkspacePrefix('do it', '/ws');
        assert.equal(withWorkspacePrefix(once, '/ws'), once);
    });
});

describe('roleLabel', () => {
    it('title-cases each hyphen-separated word', () => {
        assert.equal(roleLabel('backend-developer'), 'Backend Developer');
        assert.equal(roleLabel('generalist'), 'Generalist');
        assert.equal(roleLabel('devops-engineer'), 'Devops Engineer');
    });
    it('covers every real engine role (core/plan.py VALID_ROLES)', () => {
        assert.equal(SUBAGENT_ROLES.length, 9);
        for (const role of SUBAGENT_ROLES) {
            assert.ok(roleLabel(role).length > 0);
        }
    });
});

describe('parseFileMentions', () => {
    it('extracts a single @file mention', () => {
        assert.deepEqual(parseFileMentions('please fix @router.py'), ['router.py']);
    });

    it('extracts multiple mentions in order of first appearance', () => {
        assert.deepEqual(
            parseFileMentions('compare @agents/router.py with @agents/base.py, then update @index.ts'),
            ['agents/router.py', 'agents/base.py', 'index.ts'],
        );
    });

    it('dedupes repeated mentions of the same file', () => {
        assert.deepEqual(parseFileMentions('look at @router.py again — @router.py has the bug'), ['router.py']);
    });

    it('ignores plain @-mentions with no recognized file extension', () => {
        assert.deepEqual(parseFileMentions('cc @someone, please review'), []);
    });

    it('returns an empty array for text with no mentions', () => {
        assert.deepEqual(parseFileMentions('no file references here'), []);
    });

    it('recognizes non-web-stack extensions (Phase 2: any project, not just JS/Python)', () => {
        assert.deepEqual(
            parseFileMentions('check @api/UserController.php and @cmd/main.go and @src/lib.rs'),
            ['api/UserController.php', 'cmd/main.go', 'src/lib.rs'],
        );
    });

    it('recognizes a multi-dot filename by its final extension (.blade.php)', () => {
        assert.deepEqual(
            parseFileMentions('render @resources/views/welcome.blade.php'),
            ['resources/views/welcome.blade.php'],
        );
    });

    it('recognizes a Vue single-file component', () => {
        assert.deepEqual(parseFileMentions('update @src/App.vue'), ['src/App.vue']);
    });
});

describe('capConversation (Phase 6.4)', () => {
    function userMsg(id: string): ChatMessage {
        return { role: 'user', id, text: `msg-${id}` };
    }

    it('leaves a conversation under the cap untouched (same reference)', () => {
        const conversation = [userMsg('1'), userMsg('2'), userMsg('3')];
        assert.equal(capConversation(conversation, 200), conversation);
    });

    it('drops the oldest messages once over the cap', () => {
        const conversation = Array.from({ length: 10 }, (_, i) => userMsg(String(i)));
        const capped = capConversation(conversation, 5);
        assert.equal(capped.length, 5);
    });

    it('always preserves the first message even as everything else ages out', () => {
        const conversation = Array.from({ length: 250 }, (_, i) => userMsg(String(i)));
        const capped = capConversation(conversation, MAX_CLIENT_MESSAGES);
        assert.equal(capped[0].id, '0');
        assert.equal(capped.length, MAX_CLIENT_MESSAGES);
    });

    it('keeps the MOST RECENT messages after the preserved first one', () => {
        const conversation = Array.from({ length: 10 }, (_, i) => userMsg(String(i)));
        const capped = capConversation(conversation, 5);
        // first (0) + newest 4 of the remaining 9 = [0, 6, 7, 8, 9]
        assert.deepEqual(capped.map(m => m.id), ['0', '6', '7', '8', '9']);
    });

    it('never duplicates the first message when the conversation barely exceeds the cap', () => {
        const conversation = Array.from({ length: 6 }, (_, i) => userMsg(String(i)));
        const capped = capConversation(conversation, 5);
        const ids = capped.map(m => m.id);
        assert.equal(new Set(ids).size, ids.length, 'duplicate id found');
        assert.equal(ids[0], '0');
    });

    it('defaults to MAX_CLIENT_MESSAGES when no max is given', () => {
        const conversation = Array.from({ length: 250 }, (_, i) => userMsg(String(i)));
        assert.equal(capConversation(conversation).length, MAX_CLIENT_MESSAGES);
    });

    it('never mutates the input array', () => {
        const conversation = Array.from({ length: 10 }, (_, i) => userMsg(String(i)));
        const snapshot = [...conversation];
        capConversation(conversation, 5);
        assert.deepEqual(conversation, snapshot);
    });
});

describe('visibleMessages (Phase 6.4)', () => {
    function userMsg(id: string): ChatMessage {
        return { role: 'user', id, text: `msg-${id}` };
    }

    it('returns everything when the conversation is already within the window', () => {
        const conversation = [userMsg('1'), userMsg('2')];
        assert.equal(visibleMessages(conversation, false, 100), conversation);
    });

    it('windows to the most recent N messages when over the window and not showAll', () => {
        const conversation = Array.from({ length: 150 }, (_, i) => userMsg(String(i)));
        const visible = visibleMessages(conversation, false, DEFAULT_RENDER_WINDOW);
        assert.equal(visible.length, DEFAULT_RENDER_WINDOW);
        assert.equal(visible[0].id, String(150 - DEFAULT_RENDER_WINDOW));
        assert.equal(visible[visible.length - 1].id, '149');
    });

    it('returns everything when showAll is true, regardless of length', () => {
        const conversation = Array.from({ length: 150 }, (_, i) => userMsg(String(i)));
        assert.equal(visibleMessages(conversation, true, DEFAULT_RENDER_WINDOW).length, 150);
    });
});
