/********************************************************************************
 * Soriku IDE — default agent resolution unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';
import { DefaultAgentCandidate, resolveDefaultAgent, toDefaultAgentCandidate } from '../common/default-agent';

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

function candidate(overrides: Partial<DefaultAgentCandidate> & { id: string; name: string }): DefaultAgentCandidate {
    return overrides;
}

describe('resolveDefaultAgent', () => {
    const agents: DefaultAgentCandidate[] = [
        candidate({ id: 'a1', name: 'Master Planner' }),
        candidate({ id: 'a2', name: 'Koda' }),
        candidate({ id: 'a3', name: 'Soriku Code Architect' }),
    ];

    it('prefers an exact id match over the Koda fallback', () => {
        const pick = resolveDefaultAgent(agents, 'a1');
        assert.equal(pick?.id, 'a1');
    });

    it('falls back to the agent named Koda when the preferred id is stale/missing', () => {
        const pick = resolveDefaultAgent(agents, 'does-not-exist');
        assert.equal(pick?.id, 'a2');
    });

    it('falls back to Koda when no preferred id is given', () => {
        const pick = resolveDefaultAgent(agents);
        assert.equal(pick?.id, 'a2');
    });

    it('matches the Koda fallback case-insensitively and trimmed', () => {
        const withCasing: DefaultAgentCandidate[] = [candidate({ id: 'x', name: '  koDA  ' })];
        const pick = resolveDefaultAgent(withCasing);
        assert.equal(pick?.id, 'x');
    });

    it('returns undefined when nothing matches and no Koda exists', () => {
        const withoutKoda: DefaultAgentCandidate[] = [candidate({ id: 'a1', name: 'Master Planner' })];
        assert.equal(resolveDefaultAgent(withoutKoda), undefined);
    });

    it('returns undefined for an empty agent list', () => {
        assert.equal(resolveDefaultAgent([]), undefined);
    });
});

describe('toDefaultAgentCandidate', () => {
    it('maps id, trimmed name, category and avatar color', () => {
        const result = toDefaultAgentCandidate(persona({
            id: 'a1',
            name: '  Koda  ',
            category: 'coding',
            persona: { avatar_color: '#abc' },
        }));
        assert.deepEqual(result, { id: 'a1', name: 'Koda', category: 'coding', avatarColor: '#abc' });
    });

    it('falls back to id when name is blank', () => {
        const result = toDefaultAgentCandidate(persona({ id: 'agent-xyz', name: '   ' }));
        assert.equal(result.name, 'agent-xyz');
    });
});
