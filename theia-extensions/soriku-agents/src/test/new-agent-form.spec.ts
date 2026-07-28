/********************************************************************************
 * Soriku IDE — "+ New agent" wizard request-building unit tests (Phase 6.1)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentCreateRequest } from '../common/new-agent-form';

describe('buildAgentCreateRequest', () => {
    it('sends the category as role — AgentCreateRequest has no separate category field', () => {
        const req = buildAgentCreateRequest('Docs Writer', 'reasoning', undefined);
        assert.equal(req.role, 'reasoning');
        assert.equal((req as unknown as { category?: string }).category, undefined);
    });

    it('trims the name', () => {
        const req = buildAgentCreateRequest('  Koda  ', 'coding', undefined);
        assert.equal(req.name, 'Koda');
    });

    it('omits preferred_model when the model choice is "auto" (empty string)', () => {
        const req = buildAgentCreateRequest('Koda', 'coding', '');
        assert.equal(req.preferred_model, undefined);
        assert.ok(!('preferred_model' in req) || req.preferred_model === undefined);
    });

    it('omits preferred_model when undefined (model listing failed)', () => {
        const req = buildAgentCreateRequest('Koda', 'coding', undefined);
        assert.equal(req.preferred_model, undefined);
    });

    it('carries a real preferred model through unchanged', () => {
        const req = buildAgentCreateRequest('Koda', 'coding', 'qwen2.5-coder:7b');
        assert.equal(req.preferred_model, 'qwen2.5-coder:7b');
    });

    it('covers all three categories', () => {
        for (const category of ['coding', 'reasoning', 'general'] as const) {
            assert.equal(buildAgentCreateRequest('x', category, undefined).role, category);
        }
    });
});
