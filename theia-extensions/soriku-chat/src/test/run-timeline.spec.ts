/********************************************************************************
 * Soriku IDE — run-timeline spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantTurn, AssistantTurn, ChatToolCall } from '../common/chat-model';
import {
    deriveRunState, deriveSteps, resultFailed, runStateSnapshot, runStats, shortPath, stepTarget, summarizeResult,
} from '../common/run-timeline';

function turnWith(calls: ChatToolCall[], patch: Partial<AssistantTurn> = {}): AssistantTurn {
    return { ...createAssistantTurn('t1'), toolCalls: calls, ...patch };
}

describe('shortPath / stepTarget', () => {
    it('keeps just the file name, as the design does', () => {
        assert.equal(shortPath('/Users/m/Sites/app/agents/router.py'), 'router.py');
        assert.equal(shortPath('router.py'), 'router.py');
    });
    it('reads path, command and query from args (object or JSON string)', () => {
        assert.equal(stepTarget({ tool: 'file_read', status: 'done', args: { path: '/a/b/c.py' } }), 'c.py');
        assert.equal(stepTarget({ tool: 'shell_exec', status: 'done', args: JSON.stringify({ command: 'pytest -q' }) }), 'pytest -q');
        assert.equal(stepTarget({ tool: 'project_search', status: 'done', args: { query: 'route(' } }), 'route(');
        assert.equal(stepTarget({ tool: 'file_read', status: 'done', args: 'not json' }), undefined);
    });
    it('finds the file in an apply_patch diff header', () => {
        const patch = '--- a/src/x.php\n+++ b/src/x.php\n@@ -1 +1 @@\n-a\n+b\n';
        assert.equal(stepTarget({ tool: 'apply_patch', status: 'done', args: { patch } }), 'x.php');
    });
});

describe('summarizeResult', () => {
    it('takes the first non-empty line and caps it', () => {
        assert.equal(summarizeResult('\n\nhello\nworld'), 'hello');
        assert.equal(summarizeResult('x'.repeat(200), 10), 'xxxxxxxxx…');
        assert.equal(summarizeResult(undefined), undefined);
    });
});

describe('resultFailed', () => {
    it('recognises failures reported in the result text', () => {
        for (const text of ['Refused: "/etc/x" resolves outside the workspace folder.', 'ERROR: write blocked', 'TIMEOUT: command exceeded 120s',
            'Tool call denied by user', '  failed to parse']) {
            assert.equal(resultFailed(text), true, text);
        }
        for (const text of ['{"written":"/x/a.py","bytes":14}', '12 passed', 'Errors fixed: 3', '', undefined]) {
            assert.equal(resultFailed(text), false, String(text));
        }
    });
    it('a completed call whose result is a failure is drawn as an error', () => {
        const step = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', args: { path: '/outside/app.py' },
            result: 'Refused: "/outside/app.py" resolves outside the workspace folder.' }]))[0];
        assert.equal(step.status, 'error');
        assert.equal(step.tone, 'danger');
        assert.match(step.result ?? '', /^Refused/);
    });
});

describe('deriveSteps', () => {
    it('a call that never got a result on a finished turn is an error, not a spinner', () => {
        const done = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'requested', args: { path: '/outside/app.py' } }], { status: 'done' }));
        assert.equal(done[0].status, 'error');
        assert.equal(done[0].tone, 'danger');
        assert.equal(done[0].result, 'no result');
        const live = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'running', args: { path: 'a.py' } }]));
        assert.equal(live[0].status, 'active');
        const errored = deriveSteps(turnWith([{ callId: '1', tool: 'file_read', status: 'running', args: { path: 'a' } }], { status: 'error' }));
        assert.equal(errored[0].status, 'error');
    });

    it('read and edit rows carry no result text (the design shows stats instead)', () => {
        const steps = deriveSteps(turnWith([
            { callId: '1', tool: 'file_read', status: 'done', args: { path: 'a.py' }, result: 'def route(): pass' },
            { callId: '2', tool: 'file_write', status: 'done', args: { path: 'a.py' }, result: '{"written":"/x/a.py","bytes":14}' },
        ]));
        assert.equal(steps[0].result, undefined);
        assert.equal(steps[1].result, undefined);
    });

    it('reads the real wire shape: args arrive as a JSON string', () => {
        const wire = JSON.stringify({ path: '/Users/m/ws/hello.txt', content: 'hi' });
        const steps = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', args: wire }]));
        assert.equal(steps[0].target, 'hello.txt');
    });

    it('maps tools to step kinds with verbs and status', () => {
        const steps = deriveSteps(turnWith([
            { callId: '1', tool: 'file_read', status: 'done', args: { path: 'a/router.py' }, result: 'def route()' },
            { callId: '2', tool: 'file_write', status: 'running', args: { path: 'a/router.py' } },
            { callId: '3', tool: 'shell_exec', status: 'requested', args: { command: 'pytest -q' } },
        ]));
        assert.deepEqual(steps.map(s => [s.kind, s.status]), [['read', 'done'], ['edit', 'active'], ['shell', 'waiting']]);
        assert.equal(steps[0].verbDone, 'Read');
        assert.equal(steps[1].verbActive, 'Editing');
        assert.equal(steps[2].command, 'pytest -q');
    });

    it('uses engine diff stats only when present', () => {
        const withStats = deriveSteps(turnWith(
            [{ callId: '1', tool: 'file_write', status: 'done', args: { path: '/p/agents/router.py' } }],
            { generatedFiles: [{ path: '/p/agents/router.py', added: 18, removed: 2 }] }));
        assert.equal(withStats[0].add, 18);
        assert.equal(withStats[0].del, 2);
        const without = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', args: { path: 'x.py' } }]));
        assert.equal(without[0].add, undefined);
    });

    it('adds a check row after a verified write and flags verify failures', () => {
        const ok = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', outcome: 'verified', args: { path: 'a.py' } }]));
        assert.deepEqual(ok.map(s => s.kind), ['edit', 'check']);
        assert.equal(ok[1].tone, 'ok');
        const bad = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', outcome: 'verify_failed', args: { path: 'a.py' } }]));
        assert.equal(bad[1].tone, 'warn');
        assert.equal(bad[1].result, 'needs a fix');
    });

    it('marks blocked / denied / errored calls as danger', () => {
        for (const outcome of ['blocked', 'denied', 'error'] as const) {
            const s = deriveSteps(turnWith([{ callId: '1', tool: 'file_write', status: 'done', outcome, outcomeReason: 'nope', args: { path: 'a' } }]))[0];
            assert.equal(s.status, 'error');
            assert.equal(s.tone, 'danger');
            assert.equal(s.result, 'nope');
        }
    });

    it('reads the shell exit code from the result trailer', () => {
        const fail = deriveSteps(turnWith([{ callId: '1', tool: 'shell_exec', status: 'done', args: { command: 'pytest' }, result: '1 failed\n[exit code: 1]' }]))[0];
        assert.equal(fail.status, 'error');
        assert.equal(fail.result, 'exit 1');
        const ok = deriveSteps(turnWith([{ callId: '1', tool: 'shell_exec', status: 'done', args: { command: 'pytest' }, result: '12 passed' }]))[0];
        assert.equal(ok.result, 'exit 0');
        assert.equal(ok.output, '12 passed');
    });

    it('attributes steps to the owning worker', () => {
        const t = turnWith([{ callId: '1', tool: 'file_read', status: 'done', workerId: 'w1', args: { path: 'a' } }],
            { agents: [{ workerId: 'w1', agentName: 'Koda', status: 'running', files: [], corrections: 0 }] });
        assert.equal(deriveSteps(t)[0].agent, 'Koda');
    });

    it('emits a planning row and review rows', () => {
        const t = turnWith([], {
            pendingPlan: { planId: 'p', tasks: [{ id: '1', role: 'dev', goal: 'g' }, { id: '2', role: 'dev', goal: 'h' }] },
            agents: [{ workerId: 'w', role: 'code-reviewer', status: 'done', files: [], corrections: 0, verdict: { status: 'approved', notes: 'lgtm' } }],
        });
        const steps = deriveSteps(t);
        assert.equal(steps[0].target, '2 tasks');
        assert.equal(steps[1].kind, 'review');
        assert.equal(steps[1].verbDone, 'Approved');
        assert.equal(steps[1].output, 'lgtm');
    });
});

describe('deriveRunState', () => {
    it('covers every chip state', () => {
        assert.equal(deriveRunState(turnWith([], { status: 'done' })), 'done');
        assert.equal(deriveRunState(turnWith([], { status: 'error' })), 'failed');
        assert.equal(deriveRunState(turnWith([], { status: 'interrupted' })), 'failed');
        assert.equal(deriveRunState(turnWith([]), { paused: true }), 'paused');
        assert.equal(deriveRunState(turnWith([], { awaitingApproval: true })), 'plan_ready');
        assert.equal(deriveRunState(turnWith([{ tool: 'shell_exec', status: 'requested' }])), 'needs_you');
        assert.equal(deriveRunState(turnWith([{ tool: 'file_read', status: 'running' }])), 'running');
    });
    it('a finished turn wins over paused', () => {
        assert.equal(deriveRunState(turnWith([], { status: 'done' }), { paused: true }), 'done');
    });
});

describe('runStats', () => {
    it('summarises agents, steps, files and verification', () => {
        const t = turnWith([{ callId: '1', tool: 'file_write', status: 'done', outcome: 'verified', args: { path: 'a.py' } }], {
            generatedFiles: [{ path: 'a.py', added: 3, removed: 1 }],
            agents: [{ workerId: 'w', status: 'done', files: [], corrections: 0 }],
        });
        const s = runStats(t);
        assert.equal(s.agents, 1);
        assert.equal(s.steps, 2);
        assert.equal(s.verified, 'verified');
        assert.deepEqual(s.files, [{ path: 'a.py', add: 3, del: 1 }]);
        assert.equal(runStats(turnWith([])).verified, 'none');
    });
});

describe('runStateSnapshot', () => {
    it('is idle without a turn', () => {
        assert.deepEqual(runStateSnapshot(undefined), { running: false, agents: [], verified: 'none', workers: 0, minions: 0 });
    });
    it('splits head agents from minions and carries verification', () => {
        const t = turnWith([{ callId: '1', tool: 'file_write', status: 'done', outcome: 'verified', args: { path: 'a.py' } }], {
            agents: [
                { workerId: 'w1', status: 'running', files: [], corrections: 0 },
                { workerId: 'w2', status: 'running', files: [], corrections: 0, parentAgentId: 'p1' },
                { workerId: 'w3', status: 'running', files: [], corrections: 0, parentAgentId: 'p1' },
            ],
        });
        const snap = runStateSnapshot(t);
        assert.deepEqual(
            { running: snap.running, verified: snap.verified, workers: snap.workers, minions: snap.minions },
            { running: true, verified: 'verified', workers: 1, minions: 2 });
        assert.deepEqual(snap.agents.map(a => a.minion), [false, true, true]);
        assert.equal(runStateSnapshot({ ...t, status: 'done' }).running, false);
    });
});

describe('runStateSnapshot agents', () => {
    it('names agents and shows the live activity of a running one', () => {
        const t = turnWith([{ callId: 'c1', tool: 'file_write', status: 'running', workerId: 'w1', args: { path: '/p/router.py' } }], {
            planId: 'plan-1',
            agents: [
                { workerId: 'w1', agentName: 'Koda', model: 'qwen2.5-coder:7b', status: 'running', files: ['a'], corrections: 0 },
                { workerId: 'w2', role: 'code-reviewer', status: 'done', files: [], corrections: 0 },
            ],
        });
        const snap = runStateSnapshot(t);
        assert.equal(snap.planId, 'plan-1');
        assert.deepEqual(snap.agents[0], {
            workerId: 'w1', name: 'Koda', role: undefined, model: 'qwen2.5-coder:7b', status: 'running', files: 1, minion: false,
            personaId: undefined, parentAgentId: undefined, activity: 'Editing router.py',
        });
        assert.equal(snap.agents[1].name, 'Code Reviewer');
        assert.equal(snap.agents[1].activity, undefined);
    });
});
