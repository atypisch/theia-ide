/********************************************************************************
 * Soriku IDE — plan-doc spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planMeta, planSlug, planTitle } from '../common/plan-doc';

describe('planTitle', () => {
    it('prefers the document heading', () => {
        assert.equal(planTitle('# Local-first routing fallback\n\n## Goal', 'x'), 'Local-first routing fallback');
        assert.equal(planTitle('## **Add** `router` fallback ##', 'x'), 'Add router fallback');
    });
    it('ignores a generic heading and falls back to the first sentence of the request', () => {
        assert.equal(planTitle('# Plan\n\nstuff', 'Workspace: /w\n\nAdd a fallback. Then test it.'), 'Add a fallback.');
        assert.equal(planTitle('# Execution plan', 'Fix the router'), 'Fix the router');
    });
    it('never returns an empty title and clips long ones', () => {
        assert.equal(planTitle(undefined, undefined), 'Plan');
        assert.equal(planTitle(undefined, 'x'.repeat(200)).length, 80);
    });
});

describe('planSlug', () => {
    it('makes a path-safe slug', () => {
        assert.equal(planSlug('Local-first routing fallback!'), 'local-first-routing-fallback');
        assert.equal(planSlug('Één café'), 'een-cafe');
        assert.equal(planSlug('???'), 'plan');
        assert.ok(planSlug('a'.repeat(200)).length <= 48);
    });
});

describe('planMeta', () => {
    const clock = (): string => '14:22';
    it('lists only what is known', () => {
        assert.equal(planMeta({ createdAt: 1, tasks: 4, costEur: 0, clock }), '14:22 today · 4 to-dos · €0.00 · all local');
        assert.equal(planMeta({ tasks: 1, clock }), '1 to-do');
        assert.equal(planMeta({ tasks: 2, costEur: 0.5, clock }), '2 to-dos · est. €0.50');
    });
});
