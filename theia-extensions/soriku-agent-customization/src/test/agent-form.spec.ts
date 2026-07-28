/********************************************************************************
 * Soriku IDE — agent edit form unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';
import { buildUpdateRequest, decisionPatternsToText, parseDecisionPatterns, summarizeLearning, toAgentForm } from '../common/agent-form';

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
            decisionPatternsText: '',
            preferredRoutingStrategy: '',
            toolWhitelist: [],
        });
    });

    it('tolerates missing nested objects', () => {
        const form = toAgentForm(persona({ id: 'a2' }));
        assert.equal(form.description, '');
        assert.equal(form.systemPrompt, '');
        assert.equal(form.visibility, '');
        assert.equal(form.preferredRoutingStrategy, '');
        assert.deepEqual(form.toolWhitelist, []);
    });

    it('reads preferred_routing_strategy and tool_whitelist when set', () => {
        const form = toAgentForm(persona({
            id: 'a3',
            preferred_routing_strategy: 'prefer_local',
            tool_whitelist: ['file_read', 'file_write'],
        }));
        assert.equal(form.preferredRoutingStrategy, 'prefer_local');
        assert.deepEqual(form.toolWhitelist, ['file_read', 'file_write']);
    });
});

describe('buildUpdateRequest', () => {
    it('maps form fields to the PATCH body and trims', () => {
        const body = buildUpdateRequest({
            name: ' Koda ', role: ' reviewer ', description: 'd',
            preferredModel: ' auto ', visibility: 'team', systemPrompt: 'sp',
            decisionPatternsText: 'kubernetes: 0.8\nreact: 1.5\nbad line\n: 0.2',
            preferredRoutingStrategy: ' prefer_local ', toolWhitelist: ['file_read', 'file_write'],
        });
        assert.equal(body.name, 'Koda');
        assert.equal(body.role, 'reviewer');
        assert.equal(body.preferred_model, 'auto');
        assert.equal(body.system_prompt, 'sp');
        assert.equal(body.visibility, 'team');
        // parsed + clamped; junk/empty-key lines dropped
        assert.deepEqual(body.decision_patterns, { kubernetes: 0.8, react: 1 });
        assert.equal(body.preferred_routing_strategy, 'prefer_local');
        assert.deepEqual(body.tool_whitelist, ['file_read', 'file_write']);
    });

    it('omits visibility and preferred_routing_strategy when blank', () => {
        const body = buildUpdateRequest({
            name: 'x', role: '', description: '', preferredModel: '', visibility: '   ',
            systemPrompt: '', decisionPatternsText: '',
            preferredRoutingStrategy: '   ', toolWhitelist: [],
        });
        assert.ok(!('visibility' in body));
        assert.ok(!('preferred_routing_strategy' in body));
        assert.equal(body.preferred_model, '');
        assert.deepEqual(body.decision_patterns, {});
        assert.deepEqual(body.tool_whitelist, []);
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

describe('decision patterns round-trip', () => {
    it('reads patterns into "key: weight" lines', () => {
        const text = decisionPatternsToText(persona({
            id: 'a1',
            memory: { decision_patterns: { patterns: { kubernetes: 0.8, react: 0.5 } } } as unknown as AgentPersona['memory'],
        }));
        assert.equal(text, 'kubernetes: 0.8\nreact: 0.5');
    });
    it('parses, clamps to 0..1 and drops invalid lines', () => {
        assert.deepEqual(
            parseDecisionPatterns('kubernetes: 0.8\nreact: 2\nneg: -1\nnope\n: 0.3\n  '),
            { kubernetes: 0.8, react: 1, neg: 0 },
        );
    });
    it('is empty-safe', () => {
        assert.deepEqual(parseDecisionPatterns(''), {});
        assert.equal(decisionPatternsToText(persona({ id: 'a2' })), '');
    });
});
