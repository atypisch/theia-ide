/********************************************************************************
 * Soriku IDE — approval-queue unit tests (fake timers, Theia-free)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalQueue } from '../common/approval-queue';

type D = { approved: boolean };
const DENIED: D = { approved: false };

/** A controllable fake timer set, so timeout behaviour is deterministic. */
function fakeTimers() {
    const pending = new Map<number, () => void>();
    let seq = 0;
    return {
        set: (fn: () => void, _ms: number) => { const id = ++seq; pending.set(id, fn); return id as unknown as ReturnType<typeof setTimeout>; },
        clear: (t: ReturnType<typeof setTimeout>) => { pending.delete(t as unknown as number); },
        fire: (t: ReturnType<typeof setTimeout>) => { const fn = pending.get(t as unknown as number); pending.delete(t as unknown as number); fn?.(); },
        get size() { return pending.size; },
        firstId: () => [...pending.keys()][0] as unknown as ReturnType<typeof setTimeout>,
    };
}

function makeQueue(overrides: Partial<{ changes: number; autoDenied: string[]; timers: ReturnType<typeof fakeTimers> }> = {}) {
    const timers = overrides.timers ?? fakeTimers();
    const state = { changes: 0, autoDenied: [] as string[] };
    const q = new ApprovalQueue<{ id: string }, D>({
        denied: () => DENIED,
        onChange: () => { state.changes++; },
        onAutoDeny: p => state.autoDenied.push((p as { id: string }).id),
        setTimer: timers.set,
        clearTimer: timers.clear,
    });
    return { q, timers, state };
}

describe('ApprovalQueue — FIFO (#10)', () => {
    it('shows approvals one at a time in arrival order; others are NOT auto-denied', () => {
        const { q } = makeQueue();
        const decisions: string[] = [];
        q.enqueue({ id: 'a' }, () => decisions.push('a'));
        q.enqueue({ id: 'b' }, () => decisions.push('b'));
        assert.equal(q.head?.id, 'a');
        assert.equal(q.count, 2);
        assert.deepEqual(decisions, []);           // b was NOT auto-denied (the old bug)
        q.respond({ approved: true });             // answer a
        assert.deepEqual(decisions, ['a']);
        assert.equal(q.head?.id, 'b');             // b now shown
        q.respond({ approved: true });
        assert.deepEqual(decisions, ['a', 'b']);
        assert.equal(q.head, undefined);
    });
});

describe('ApprovalQueue — auto-deny timeout (#1)', () => {
    it('auto-denies an unanswered approval and advances', () => {
        const { q, timers, state } = makeQueue();
        let aDecision: D | undefined;
        q.enqueue({ id: 'a' }, d => { aDecision = d; });
        q.enqueue({ id: 'b' }, () => { /* keep */ });
        timers.fire(timers.firstId());             // a's timer fires
        assert.deepEqual(aDecision, DENIED);
        assert.deepEqual(state.autoDenied, ['a']);
        assert.equal(q.head?.id, 'b');             // advanced to b
    });
    it('clears the timer when answered normally (no late auto-deny)', () => {
        const { q, timers } = makeQueue();
        let calls = 0;
        q.enqueue({ id: 'a' }, () => { calls++; });
        assert.equal(timers.size, 1);
        q.respond({ approved: true });
        assert.equal(timers.size, 0);              // timer cleared
        assert.equal(calls, 1);
    });
});

describe('ApprovalQueue — configurable timeout (Phase 2: long unattended runs)', () => {
    it('setTimeoutMs(0) disables auto-deny for approvals enqueued afterward', () => {
        const { q, timers } = makeQueue();
        q.setTimeoutMs(0);
        let decided = false;
        q.enqueue({ id: 'a' }, () => { decided = true; });
        assert.equal(timers.size, 0);   // no timer was ever set
        assert.equal(decided, false);   // never auto-denied — stays pending indefinitely
    });
    it('a positive timeout still arms a timer as before', () => {
        const { q, timers } = makeQueue();
        q.setTimeoutMs(60_000);
        q.enqueue({ id: 'a' }, () => { /* keep */ });
        assert.equal(timers.size, 1);
    });
    it('setTimeoutMs only affects approvals enqueued after the call', () => {
        const { q, timers } = makeQueue();
        q.enqueue({ id: 'a' }, () => { /* already-queued, keeps its timer */ });
        assert.equal(timers.size, 1);
        q.setTimeoutMs(0);
        assert.equal(timers.size, 1);   // existing timer untouched
    });
});

describe('ApprovalQueue — flush (#1/#16)', () => {
    it('cancelAll denies every queued approval and clears timers', () => {
        const { q, timers } = makeQueue();
        const denials: string[] = [];
        q.enqueue({ id: 'a' }, d => { if (!d.approved) { denials.push('a'); } });
        q.enqueue({ id: 'b' }, d => { if (!d.approved) { denials.push('b'); } });
        q.cancelAll();
        assert.deepEqual(denials.sort(), ['a', 'b']);
        assert.equal(q.count, 0);
        assert.equal(timers.size, 0);
    });
    it('cancelHead drops only the shown approval', () => {
        const { q } = makeQueue();
        const denials: string[] = [];
        q.enqueue({ id: 'a' }, d => { if (!d.approved) { denials.push('a'); } });
        q.enqueue({ id: 'b' }, () => { /* keep */ });
        q.cancelHead();
        assert.deepEqual(denials, ['a']);
        assert.equal(q.head?.id, 'b');
    });
});
