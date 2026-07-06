/********************************************************************************
 * Soriku IDE — agent view model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';
import { initials, toAgentItem, toAgentItems } from '../common/agent-view';

function persona(overrides: Partial<AgentPersona> & { id: string }): AgentPersona {
    const base: AgentPersona = {
        id: overrides.id,
        name: '',
        role: '',
        category: '',
        version: 1,
        persona: {},
        specializations: [],
        memory: {},
        intelligence: { system_prompt: '' },
        knowledge: {},
        learning: {},
        benchmarks: {},
        shortcuts: [],
        simezu: {},
        stats: {},
    };
    return { ...base, ...overrides };
}

describe('initials', () => {
    it('uses first two letters of a single word', () => {
        assert.equal(initials('Pilot'), 'PI');
    });
    it('uses first letters of first and last words', () => {
        assert.equal(initials('Backend Specialist'), 'BS');
    });
    it('falls back to ? for empty input', () => {
        assert.equal(initials('   '), '?');
    });
});

describe('toAgentItem', () => {
    it('maps name, role, description and avatar color', () => {
        const item = toAgentItem(persona({
            id: 'a1',
            name: 'Pilot',
            role: 'orchestrator',
            persona: { description: ' Leads multi-step tasks ', avatar_color: '#abc' },
        }));
        assert.deepEqual(item, {
            id: 'a1',
            name: 'Pilot',
            role: 'orchestrator',
            description: 'Leads multi-step tasks',
            avatarText: 'PI',
            avatarColor: '#abc',
            category: '',
            skills: [],
            preferredModel: undefined,
        });
    });

    it('maps category, specialization names and preferred model', () => {
        const item = toAgentItem(persona({
            id: 'a3',
            category: 'coding',
            preferred_model: 'qwen2.5-coder:7b',
            specializations: [{ name: 'SemVer' }, { name: 'CVEs', level: 'expert' }],
        }));
        assert.equal(item.category, 'coding');
        assert.equal(item.preferredModel, 'qwen2.5-coder:7b');
        assert.deepEqual(item.skills, ['SemVer', 'CVEs']);
    });

    it('falls back to id when name is blank', () => {
        const item = toAgentItem(persona({ id: 'agent-xyz', name: '   ' }));
        assert.equal(item.name, 'agent-xyz');
        assert.equal(item.avatarText, 'AG');
    });

    it('tolerates a missing persona config', () => {
        const item = toAgentItem(persona({ id: 'a2', name: 'Solo' }));
        assert.equal(item.description, '');
        assert.equal(item.avatarColor, undefined);
    });
});

describe('toAgentItems', () => {
    it('maps a list preserving order', () => {
        const items = toAgentItems([persona({ id: 'a' }), persona({ id: 'b', name: 'Bee' })]);
        assert.deepEqual(items.map(i => i.id), ['a', 'b']);
        assert.equal(items[1].name, 'Bee');
    });
});
