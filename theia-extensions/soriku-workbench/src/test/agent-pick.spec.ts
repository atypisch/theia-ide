/********************************************************************************
 * Soriku IDE — agent quick-pick unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';
import { buildAgentPickItems } from '../common/agent-pick';

function persona(over: Partial<AgentPersona> & { id: string }): AgentPersona {
    const base: AgentPersona = {
        id: over.id, name: '', role: '', category: '', version: 1,
        persona: {}, specializations: [], memory: {},
        intelligence: { system_prompt: '' }, knowledge: {}, learning: {},
        benchmarks: {}, shortcuts: [], simezu: {}, stats: {},
    };
    return { ...base, ...over };
}

describe('buildAgentPickItems', () => {
    it('uses name as label and role as description', () => {
        const items = buildAgentPickItems([persona({ id: 'a1', name: 'Koda', role: 'reviewer' })]);
        assert.deepEqual(items, [{ id: 'a1', label: 'Koda', description: 'reviewer' }]);
    });

    it('falls back to id for the label and description from persona', () => {
        const items = buildAgentPickItems([persona({ id: 'a2', persona: { description: 'helps out' } })]);
        assert.equal(items[0].label, 'a2');
        assert.equal(items[0].description, 'helps out');
    });

    it('leaves description undefined when nothing is available', () => {
        const items = buildAgentPickItems([persona({ id: 'a3', name: 'Solo' })]);
        assert.equal(items[0].description, undefined);
    });

    it('preserves order', () => {
        const items = buildAgentPickItems([persona({ id: 'a' }), persona({ id: 'b' })]);
        assert.deepEqual(items.map(i => i.id), ['a', 'b']);
    });
});
