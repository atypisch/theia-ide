/********************************************************************************
 * Soriku IDE — routing overrides model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoutingOverridesResponse, V1ModelsResponse } from 'soriku-engine-client-ext/lib/common/engine-types';
import { mergeCategoryRows, parseModelIds, parseOverrides } from '../common/routing-overrides';

describe('parseOverrides', () => {
    it('maps category/model_id pairs', () => {
        const res = { overrides: [{ category: 'code_generation', model_id: 'local-coder' }] } as unknown as RoutingOverridesResponse;
        assert.deepEqual(parseOverrides(res), [{ category: 'code_generation', modelId: 'local-coder' }]);
    });
    it('drops incomplete rows', () => {
        const res = { overrides: [{ category: 'x' }, { model_id: 'y' }] } as unknown as RoutingOverridesResponse;
        assert.deepEqual(parseOverrides(res), []);
    });
    it('handles an empty/missing list', () => {
        assert.deepEqual(parseOverrides({ overrides: [] }), []);
        assert.deepEqual(parseOverrides({} as unknown as RoutingOverridesResponse), []);
    });
});

describe('parseModelIds', () => {
    it('extracts string ids', () => {
        const res = { data: [{ id: 'auto' }, { id: 'local-a' }] } as unknown as V1ModelsResponse;
        assert.deepEqual(parseModelIds(res), ['auto', 'local-a']);
    });
    it('handles missing data', () => {
        assert.deepEqual(parseModelIds({} as unknown as V1ModelsResponse), []);
    });
});

describe('mergeCategoryRows', () => {
    it('shows every known category, with an override where one exists', () => {
        const rows = mergeCategoryRows(
            ['code_generation', 'code_review', 'docs'],
            [{ category: 'code_review', modelId: 'local-coder' }],
        );
        assert.deepEqual(rows, [
            { category: 'code_generation', override: undefined },
            { category: 'code_review', override: 'local-coder' },
            { category: 'docs', override: undefined },
        ]);
    });

    it('sorts categories alphabetically regardless of input order', () => {
        const rows = mergeCategoryRows(['docs', 'code_generation'], []);
        assert.deepEqual(rows.map(r => r.category), ['code_generation', 'docs']);
    });

    it('ignores overrides for categories the capability map no longer reports', () => {
        const rows = mergeCategoryRows(['docs'], [{ category: 'stale_category', modelId: 'x' }]);
        assert.deepEqual(rows, [{ category: 'docs', override: undefined }]);
    });
});
