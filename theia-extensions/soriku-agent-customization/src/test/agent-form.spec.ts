/********************************************************************************
 * Soriku IDE — agent edit form unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';
import { buildUpdateRequest, summarizeLearning, toAgentForm } from '../common/agent-form';

function persona(over: Partial<AgentPersona> & { id: string }): AgentPersona {
    const base: AgentPersona = {
        id: over.id, name: '', role: '', category: '', version: 1,
        persona: {}, specializations: [], memory: {},
        intelligence: { system_prompt: '' }, knowledge: {}, learning: {},
        benchmarks: {}, shortcuts: [], simezu: {}, stats: {},
    };
    return { ...base, ...over };
}

describe('toAgentForm', () => {
    it('reads fields from the nested persona shape', () => {
        const form = toAgentForm(persona({
            id: 'a1',
            name: 'Koda',
            role: 'reviewer',
            preferred_model: 'auto',
            persona: { description: 'Reviews code' },
            intelligence: { system_prompt: 'You are Koda.' },
            simezu: { visibility: 'private' },
        }));
        assert.deepEqual(form, {
            name: 'Koda',
            role: 'reviewer',
            description: 'Reviews code',
            preferredModel: 'auto',
            visibility: 'private',
            systemPrompt: 'You are Koda.',
        });
    });

    it('tolerates missing nested objects', () => {
        const form = toAgentForm(persona({ id: 'a2' }));
        assert.equal(form.description, '');
        assert.equal(form.systemPrompt, '');
        assert.equal(form.visibility, '');
    });
});

describe('buildUpdateRequest', () => {
    it('maps form fields to the PATCH body and trims', () => {
        const body = buildUpdateRequest({
            name: ' Koda ', role: ' reviewer ', description: 'd',
            preferredModel: ' auto ', visibility: 'team', systemPrompt: 'sp',
        });
        assert.equal(body.name, 'Koda');
        assert.equal(body.role, 'reviewer');
        assert.equal(body.preferred_model, 'auto');
        assert.equal(body.system_prompt, 'sp');
        assert.equal(body.visibility, 'team');
    });

    it('omits visibility when blank', () => {
        const body = buildUpdateRequest({
            name: 'x', role: '', description: '', preferredModel: '', visibility: '   ', systemPrompt: '',
        });
        assert.ok(!('visibility' in body));
        assert.equal(body.preferred_model, '');
    });
});

describe('summarizeLearning', () => {
    it('extracts feedback rules, quality scores, stack and stats', () => {
        const p = persona({
            id: 'a1',
            intelligence: {
                system_prompt: '',
                // richer engine shape (objects), read defensively
                domain_rules: [
                    { rule: "Adreseer 'kubernetes' expliciet.", weight: 0.8, source: 'feedback' },
                    { rule: 'Template rule', weight: 1.0, source: 'template' },
                ],
            } as unknown as AgentPersona['intelligence'],
            learning: { quality_scores: { coding: { ratio: 0.83, count: 6 } } } as unknown as AgentPersona['learning'],
            memory: { stack_fingerprint: { confirmed: ['kubernetes', 'fastapi'] } } as unknown as AgentPersona['memory'],
            stats: { interactions: 9, positive_feedback: 5, negative_feedback: 1 } as unknown as AgentPersona['stats'],
        });
        const l = summarizeLearning(p);
        assert.deepEqual(l.feedbackRules, ["Adreseer 'kubernetes' expliciet."]); // template rule excluded
        assert.deepEqual(l.qualityScores, [{ category: 'coding', ratio: 0.83, count: 6 }]);
        assert.deepEqual(l.stack, ['kubernetes', 'fastapi']);
        assert.equal(l.interactions, 9);
        assert.equal(l.positive, 5);
        assert.equal(l.negative, 1);
    });

    it('is empty-safe for a fresh agent', () => {
        const l = summarizeLearning(persona({ id: 'a2' }));
        assert.deepEqual(l.feedbackRules, []);
        assert.deepEqual(l.qualityScores, []);
        assert.equal(l.interactions, 0);
    });
});
