/********************************************************************************
 * Soriku IDE — agents-panel spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agentRowStatus, relativeWhen } from '../common/agents-panel';

const base = { workerId: 'w', name: 'Koda', status: 'running' as const, files: 0, minion: false };

describe('agentRowStatus', () => {
    it('shows the live activity of a running agent, pulsing', () => {
        assert.deepEqual(agentRowStatus({ ...base, activity: 'Editing router.py' }), { text: 'Editing router.py', tone: 'work', pulse: true });
        assert.equal(agentRowStatus(base).text, 'Working');
    });
    it('summarises a finished agent and flags failures', () => {
        assert.equal(agentRowStatus({ ...base, status: 'done', files: 2 }).text, 'Done · 2 files');
        assert.equal(agentRowStatus({ ...base, status: 'done', files: 1 }).text, 'Done · 1 file');
        assert.equal(agentRowStatus({ ...base, status: 'done' }).text, 'Done');
        assert.deepEqual(agentRowStatus({ ...base, status: 'error' }), { text: 'Failed', tone: 'error', pulse: false });
    });
});

describe('relativeWhen', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    it('buckets by age and tolerates bad input', () => {
        assert.equal(relativeWhen('2026-10-17T11:59:50Z', now), 'just now');
        assert.equal(relativeWhen('2026-10-17T11:50:00Z', now), '10m ago');
        assert.equal(relativeWhen('2026-10-17T09:00:00Z', now), '3h ago');
        assert.equal(relativeWhen('2026-10-15T12:00:00Z', now), '2d ago');
        assert.equal(relativeWhen(undefined, now), '');
        assert.equal(relativeWhen('nope', now), '');
    });
});
