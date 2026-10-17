/********************************************************************************
 * Soriku IDE — run-state spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_RUN_STATE, formatWorkerCounts, sameRunState } from '../common/run-state';

describe('formatWorkerCounts', () => {
    it('matches the design wording', () => {
        assert.equal(formatWorkerCounts({ running: true, agents: [], verified: 'none', workers: 1, minions: 2 }), '1 worker · 2 minions');
        assert.equal(formatWorkerCounts({ running: true, agents: [], verified: 'none', workers: 3, minions: 1 }), '3 workers · 1 minion');
        assert.equal(formatWorkerCounts({ running: true, agents: [], verified: 'none', workers: 2, minions: 0 }), '2 workers');
    });
    it('is empty when there is nothing to show', () => {
        assert.equal(formatWorkerCounts(IDLE_RUN_STATE), '');
    });
    it('honours a custom sub-agent label', () => {
        assert.equal(formatWorkerCounts({ running: true, agents: [], verified: 'none', workers: 1, minions: 2 }, 'subagents'), '1 worker · 2 subagents');
        assert.equal(formatWorkerCounts({ running: true, agents: [], verified: 'none', workers: 1, minions: 1 }, 'subagents'), '1 worker · 1 subagent');
    });
});

describe('sameRunState', () => {
    it('compares every field', () => {
        assert.equal(sameRunState(IDLE_RUN_STATE, { ...IDLE_RUN_STATE }), true);
        assert.equal(sameRunState(IDLE_RUN_STATE, { ...IDLE_RUN_STATE, verified: 'failed' }), false);
        assert.equal(sameRunState(IDLE_RUN_STATE, { ...IDLE_RUN_STATE, workers: 1 }), false);
        const agent = { workerId: 'w', name: 'Koda', status: 'running' as const, files: 0, minion: false };
        assert.equal(sameRunState(IDLE_RUN_STATE, { ...IDLE_RUN_STATE, agents: [agent] }), false);
        assert.equal(sameRunState({ ...IDLE_RUN_STATE, agents: [agent] }, { ...IDLE_RUN_STATE, agents: [{ ...agent }] }), true);
        assert.equal(sameRunState(IDLE_RUN_STATE, { ...IDLE_RUN_STATE, planId: 'p' }), false);
    });
});
