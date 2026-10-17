/********************************************************************************
 * Soriku IDE — run timeline: derive v2 step rows + run state from an assistant turn (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { RunStateSnapshot } from 'soriku-engine-client-ext/lib/common/run-state';
import { AssistantTurn, ChatToolCall } from './chat-model';

export type StepKind = 'think' | 'read' | 'edit' | 'shell' | 'check' | 'review';
/** waiting = blocked on the user (shell/write approval). */
export type StepStatus = 'active' | 'waiting' | 'done' | 'error';
export type StepTone = 'default' | 'ok' | 'warn' | 'danger';

export interface RunStep {
    id: string;
    kind: StepKind;
    /** Agent label (persona name or role) — shown on the right of the row. */
    agent?: string;
    verbActive: string;
    verbDone: string;
    target?: string;
    /** Diff stats — only when the engine reported them; never fabricated. */
    add?: number;
    del?: number;
    result?: string;
    tone: StepTone;
    status: StepStatus;
    /** Shell: the exact command awaiting/finished (shown in the inline approval). */
    command?: string;
    /** Expandable body: shell output or review notes. */
    output?: string;
}

/** The chip in the chat header (v2): Plan ready / Running / Needs you / Done / Paused / Failed. */
export type RunState = 'ready' | 'plan_ready' | 'running' | 'needs_you' | 'paused' | 'done' | 'failed';

const READ_TOOLS = new Set(['file_read', 'list_directory', 'project_search']);
const EDIT_TOOLS = new Set(['file_write', 'apply_patch']);
const SHELL_TOOLS = new Set(['shell_exec', 'shell_job_status', 'shell_job_stop']);

export function toolKind(tool: string): StepKind {
    if (READ_TOOLS.has(tool)) { return 'read'; }
    if (EDIT_TOOLS.has(tool)) { return 'edit'; }
    if (SHELL_TOOLS.has(tool)) { return 'shell'; }
    return 'think';
}

function argsOf(args: unknown): Record<string, unknown> {
    if (typeof args === 'string') {
        try {
            const parsed = JSON.parse(args);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        } catch {
            return {};
        }
    }
    return args && typeof args === 'object' ? args as Record<string, unknown> : {};
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** `/a/b/c.py` → `c.py` — the design shows bare file names. */
export function shortPath(p: string): string {
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.length === 0 ? p : parts[parts.length - 1];
}

/** The thing a step acts on: a file for read/edit, the command for shell, the query for search. */
export function stepTarget(call: ChatToolCall): string | undefined {
    const a = argsOf(call.args);
    if (call.tool === 'shell_exec') { return str(a.command) ?? str(a.cmd); }
    if (call.tool === 'project_search') { return str(a.query) ?? str(a.pattern); }
    if (call.tool === 'apply_patch') {
        const file = str(a.path) ?? str(a.file);
        if (file) { return shortPath(file); }
        const header = /^\+\+\+ [ab]?\/?(\S+)/m.exec(str(a.patch) ?? str(a.diff) ?? '');
        return header ? shortPath(header[1]) : undefined;
    }
    const target = str(a.path) ?? str(a.file_path) ?? str(a.file);
    return target ? shortPath(target) : undefined;
}

const VERBS: Record<StepKind, [string, string]> = {
    think: ['Thinking', 'Thought'],
    read: ['Reading', 'Read'],
    edit: ['Editing', 'Edited'],
    shell: ['Running', 'Ran'],
    check: ['Verifying', 'Verified'],
    review: ['Reviewing', 'Reviewed'],
};

/** First meaningful line of a tool result, capped — the row's right-hand text. */
export function summarizeResult(result: unknown, max = 80): string | undefined {
    const text = typeof result === 'string' ? result : result === undefined ? '' : JSON.stringify(result);
    const line = text.split('\n').map(l => l.trim()).find(l => l.length > 0);
    if (!line) { return undefined; }
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * The engine and the IDE report a failed tool in the result TEXT (`Refused: …`, `ERROR: …`,
 * `TIMEOUT: …`), not always as an `outcome` — so a step that "completed" with such a result
 * must not be drawn as a success.
 */
const FAILURE_TEXT = /^\s*(error|refused|failed|timeout|blocked|denied|tool call denied)\b/i;

export function resultFailed(result: unknown): boolean {
    return typeof result === 'string' && FAILURE_TEXT.test(result);
}

function statusOf(call: ChatToolCall, finished: boolean): StepStatus {
    // A call that never got a result on a finished turn will not get one — the IDE refused it
    // (e.g. a path outside the workspace) or the stream ended. Never leave it spinning.
    if (call.status !== 'done' && finished) { return 'error'; }
    if (call.status === 'requested') { return 'waiting'; }
    if (call.status === 'running') { return 'active'; }
    if (resultFailed(call.result)) { return 'error'; }
    return call.outcome === 'error' || call.outcome === 'denied' || call.outcome === 'blocked' ? 'error' : 'done';
}

function toneOf(call: ChatToolCall, finished: boolean): StepTone {
    if (call.status !== 'done' && finished) { return 'danger'; }
    if (resultFailed(call.result)) { return 'danger'; }
    switch (call.outcome) {
        case 'error': case 'denied': case 'blocked': return 'danger';
        case 'verify_failed': case 'salvaged': return 'warn';
        case 'verified': return 'ok';
        default: return 'default';
    }
}

/** Exit code from the `[exit code: N]` trailer `formatShellResult` appends; undefined = success/unknown. */
function exitCodeOf(result: unknown): number | undefined {
    const m = typeof result === 'string' ? /\[exit code: (-?\d+)\]\s*$/.exec(result) : undefined;
    return m ? Number(m[1]) : undefined;
}

function agentLabel(turn: AssistantTurn, call: ChatToolCall): string | undefined {
    const a = call.workerId ? turn.agents.find(x => x.workerId === call.workerId) : undefined;
    return a?.agentName ?? a?.role;
}

/**
 * Derives the timeline rows from the turn the SSE reducer already builds, so
 * there is one source of truth. Order = order of tool calls; a verify outcome
 * on a write becomes its own `check` row right after it, review verdicts follow.
 */
export function deriveSteps(turn: AssistantTurn): RunStep[] {
    const finished = turn.status !== 'streaming';
    const steps: RunStep[] = [];
    if (turn.pendingPlan) {
        const n = turn.pendingPlan.tasks.length;
        steps.push({
            id: 'plan', kind: 'think', verbActive: 'Planning', verbDone: 'Planned',
            target: `${n} ${n === 1 ? 'task' : 'tasks'}`, tone: 'default', status: 'done',
        });
    }
    turn.toolCalls.forEach((call, i) => {
        const kind = toolKind(call.tool);
        const status = statusOf(call, finished);
        const generated = kind === 'edit'
            ? turn.generatedFiles.find(f => stepTarget(call) !== undefined && (f.path.endsWith(stepTarget(call)!) || shortPath(f.path) === stepTarget(call)))
            : undefined;
        const exit = kind === 'shell' ? exitCodeOf(call.result) : undefined;
        const step: RunStep = {
            id: call.callId ?? `call-${i}`,
            kind,
            agent: agentLabel(turn, call),
            verbActive: kind === 'think' ? call.tool : VERBS[kind][0],
            verbDone: kind === 'think' ? call.tool : VERBS[kind][1],
            target: stepTarget(call),
            add: generated?.added,
            del: generated?.removed,
            tone: exit !== undefined && exit !== 0 ? 'danger' : toneOf(call, finished),
            status: exit !== undefined && exit !== 0 ? 'error' : status,
        };
        if (kind === 'shell') {
            step.command = stepTarget(call);
            if (call.status === 'done') {
                step.output = typeof call.result === 'string' ? call.result : undefined;
                step.result = exit !== undefined && exit !== 0 ? `exit ${exit}` : 'exit 0';
            }
        }
        // The design shows no result text on read/edit rows (edits show +/− instead).
        if (call.status !== 'done' && finished) { step.result = 'no result'; }
        if (call.status === 'done' && resultFailed(call.result)) { step.result = summarizeResult(call.result, 60); }
        if (call.outcomeReason && step.tone !== 'default') { step.result = call.outcomeReason; }
        steps.push(step);
        if (call.outcome === 'verified' || call.outcome === 'verify_failed') {
            const ok = call.outcome === 'verified';
            steps.push({
                id: `${step.id}-check`, kind: 'check', agent: step.agent, verbActive: VERBS.check[0], verbDone: VERBS.check[1],
                target: step.target, tone: ok ? 'ok' : 'warn', status: 'done', result: ok ? 'clean' : 'needs a fix',
            });
        }
    });
    for (const a of turn.agents) {
        if (!a.verdict) { continue; }
        const ok = a.verdict.status === 'approved';
        steps.push({
            id: `review-${a.workerId}`, kind: 'review', agent: a.agentName ?? a.role,
            verbActive: VERBS.review[0], verbDone: ok ? 'Approved' : 'Requested changes',
            tone: ok ? 'ok' : 'warn', status: 'done', output: a.verdict.notes,
        });
    }
    return steps;
}

export interface RunStateInput {
    /** User paused the run (v2 "Paused" banner). */
    paused?: boolean;
}

export function deriveRunState(turn: AssistantTurn, input: RunStateInput = {}): RunState {
    if (turn.status === 'error' || turn.status === 'interrupted') { return 'failed'; }
    if (turn.status === 'done') { return 'done'; }
    if (input.paused) { return 'paused'; }
    if (turn.awaitingApproval || (turn.planNeedsApproval && turn.pendingPlan && !turn.agents.length && !turn.toolCalls.length)) {
        return 'plan_ready';
    }
    if (turn.toolCalls.some(c => c.status === 'requested')) { return 'needs_you'; }
    return 'running';
}

export interface RunStats {
    agents: number;
    steps: number;
    files: { path: string; add?: number; del?: number }[];
    verified: 'verified' | 'failed' | 'none';
}

export function runStats(turn: AssistantTurn, steps: RunStep[] = deriveSteps(turn)): RunStats {
    const checks = steps.filter(s => s.kind === 'check');
    return {
        agents: turn.agents.length,
        steps: steps.length,
        files: turn.generatedFiles.map(f => ({ path: f.path, add: f.added, del: f.removed })),
        verified: checks.length === 0 ? 'none' : checks.every(c => c.tone === 'ok') ? 'verified' : 'failed',
    };
}

/** What the status bar shows about this turn: live/finished, verification, and head vs sub-agent counts. */
export function runStateSnapshot(turn: AssistantTurn | undefined): RunStateSnapshot {
    if (!turn) { return { running: false, verified: 'none', workers: 0, minions: 0 }; }
    const minions = turn.agents.filter(a => !!a.parentAgentId).length;
    return {
        running: turn.status === 'streaming',
        verified: runStats(turn).verified,
        workers: turn.agents.length - minions,
        minions,
    };
}
