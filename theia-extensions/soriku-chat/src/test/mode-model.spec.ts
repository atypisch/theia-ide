/********************************************************************************
 * Soriku IDE — mode-model spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, DEFAULT_MODEL, MAX_MULTIPLE_MODELS, placeholderFor, resolveRun, toggleMultiple } from '../common/mode-model';

describe('resolveRun', () => {
    it('defaults are Plan + Auto/local-first (v2)', () => {
        assert.equal(DEFAULT_MODE, 'plan');
        const r = resolveRun(DEFAULT_MODE, DEFAULT_MODEL);
        assert.equal(r.mode, 'plan');
        assert.equal(r.planAutoExecute, false);
        assert.equal(r.routingStrategy, 'prefer_local');
        assert.equal(r.editsEnabled, true);
    });
    it('maps routing choices to engine strategies', () => {
        assert.equal(resolveRun('agent', { kind: 'auto', routing: 'hybrid' }).routingStrategy, 'local_with_remote_conductor');
        assert.equal(resolveRun('agent', { kind: 'auto', routing: 'best' }).routingStrategy, 'prefer_quality');
    });
    it('Agent acts directly; Ask is chat-only', () => {
        const agent = resolveRun('agent', DEFAULT_MODEL);
        assert.equal(agent.mode, 'single');
        assert.equal(agent.editsEnabled, true);
        const ask = resolveRun('ask', DEFAULT_MODEL);
        assert.equal(ask.mode, 'auto');
        assert.equal(ask.editsEnabled, false);
    });
    it('a forced single model overrides routing', () => {
        const r = resolveRun('agent', { kind: 'single', modelId: 'qwen2.5-coder:7b' });
        assert.equal(r.mode, 'single');
        assert.equal(r.modelId, 'qwen2.5-coder:7b');
        assert.equal(r.routingStrategy, undefined);
    });
    it('Single without a chosen model falls back to the router', () => {
        assert.equal(resolveRun('agent', { kind: 'single' }).modelId, undefined);
    });
    it('Plan + a single model still plans (model is not forced onto the planner)', () => {
        const r = resolveRun('plan', { kind: 'single', modelId: 'm' });
        assert.equal(r.mode, 'plan');
        assert.equal(r.planAutoExecute, false);
    });
    it('Multiple with 2+ models is a compare run: plan mode, nothing to approve', () => {
        const r = resolveRun('agent', { kind: 'multiple', modelIds: ['a', 'b'] });
        assert.equal(r.mode, 'plan');
        assert.deepEqual(r.workerModels, ['a', 'b']);
        assert.equal(r.planAutoExecute, undefined);
    });
    it('Multiple with one model behaves like Single; Ask keeps edits off in compare', () => {
        const one = resolveRun('agent', { kind: 'multiple', modelIds: ['a'] });
        assert.equal(one.mode, 'single');
        assert.equal(one.modelId, 'a');
        assert.equal(resolveRun('ask', { kind: 'multiple', modelIds: ['a', 'b'] }).editsEnabled, false);
    });
    it('never sends more than the cap of models', () => {
        const r = resolveRun('agent', { kind: 'multiple', modelIds: ['a', 'b', 'c', 'd', 'e'] });
        assert.equal(r.workerModels?.length, MAX_MULTIPLE_MODELS);
    });
});

describe('toggleMultiple', () => {
    it('adds, removes and caps at three', () => {
        assert.deepEqual(toggleMultiple([], 'a'), ['a']);
        assert.deepEqual(toggleMultiple(['a', 'b'], 'a'), ['b']);
        assert.deepEqual(toggleMultiple(['a', 'b', 'c'], 'd'), ['a', 'b', 'c']);
    });
});

describe('placeholderFor (verbatim from v2)', () => {
    it('depends on mode and follow-up', () => {
        assert.equal(placeholderFor('agent'), 'Describe a change…');
        assert.equal(placeholderFor('plan'), 'Describe a change — you\'ll approve the plan first…');
        assert.equal(placeholderFor('ask'), 'Ask anything about this codebase…');
        assert.equal(placeholderFor('plan', true), 'Follow up on this session…');
    });
});
