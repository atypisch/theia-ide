/********************************************************************************
 * Soriku IDE — capability table unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityMapResponse } from 'soriku-engine-client-ext/lib/common/engine-types';
import { sortRows, toCapabilityTable } from '../common/capability-table';

const SAMPLE: CapabilityMapResponse = {
    meta: { source: 'bench-2026-05', updated_at: '2026-05-26T14:58:28Z', stale: false },
    models: {
        'alpha-model:4b': {
            code_generation: { score: 61, confidence: 'high' },
            _aggregate: { score: 55 },
            stale: false,
        },
        'beta-model:8b': {
            code_generation: { score: 80, confidence: 'high' },
            code_review: { score: 72, confidence: 'medium' },
            _aggregate: { score: 76 },
        },
    },
} as unknown as CapabilityMapResponse;

describe('toCapabilityTable', () => {
    it('extracts models, categories, scores, aggregate and meta', () => {
        const table = toCapabilityTable(SAMPLE);
        assert.deepEqual(table.categories, ['code_generation', 'code_review']);
        assert.equal(table.rows.length, 2);
        const beta = table.rows.find(r => r.model === 'beta-model:8b');
        assert.equal(beta?.scores.code_generation, 80);
        assert.equal(beta?.scores.code_review, 72);
        assert.equal(beta?.aggregate, 76);
        assert.equal(table.meta?.source, 'bench-2026-05');
        assert.equal(table.empty, false);
    });

    it('ignores _aggregate and stale as categories', () => {
        const table = toCapabilityTable(SAMPLE);
        assert.ok(!table.categories.includes('_aggregate'));
        assert.ok(!table.categories.includes('stale'));
        assert.equal(table.rows.find(r => r.model === 'alpha-model:4b')?.stale, false);
    });

    it('handles a no-data response', () => {
        const table = toCapabilityTable({ status: 'no_data' } as unknown as CapabilityMapResponse);
        assert.equal(table.empty, true);
        assert.deepEqual(table.categories, []);
    });
});

describe('sortRows', () => {
    it('sorts by a category descending, missing scores last', () => {
        const table = toCapabilityTable(SAMPLE);
        const sorted = sortRows(table.rows, 'code_review', true);
        assert.equal(sorted[0].model, 'beta-model:8b');     // 72
        assert.equal(sorted[1].model, 'alpha-model:4b'); // undefined -> last
    });

    it('sorts by aggregate ascending', () => {
        const table = toCapabilityTable(SAMPLE);
        const sorted = sortRows(table.rows, 'aggregate', false);
        assert.equal(sorted[0].model, 'alpha-model:4b'); // 55
        assert.equal(sorted[1].model, 'beta-model:8b');       // 76
    });

    it('sorts by model name', () => {
        const table = toCapabilityTable(SAMPLE);
        const sorted = sortRows(table.rows, 'model', false);
        assert.equal(sorted[0].model, 'alpha-model:4b');
    });
});
