/********************************************************************************
 * Soriku IDE — agent edit form model (pure, Theia-free, unit-testable)
 *
 * Maps an engine AgentPersona to/from the fields that PATCH /api/agents/{id}
 * actually persists: name, role, description, system_prompt, preferred_model,
 * visibility, decision_patterns, preferred_routing_strategy, tool_whitelist.
 *
 * Phase 6.2 fix: `visibility` and `decision_patterns` were ALREADY being sent
 * in every save below, but core.agents.manager.AgentManager.update() silently
 * dropped both (no handling for either kwarg) — this comment used to claim
 * visibility persisted when it didn't. Fixed engine-side; both are real now.
 *
 * preferred_routing_strategy seeds a new chat's routing choice when the chat
 * doesn't already have one (core/worker.py + server.py chat()). tool_whitelist
 * narrows — never expands — whatever tools the agent's role/task would
 * otherwise allow (Worker.execute() in core/worker.py). Both were added the
 * same session this comment block was corrected.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentPersona, AgentUpdateRequest } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface AgentForm {
    name: string;
    role: string;
    description: string;
    preferredModel: string;
    visibility: string;
    systemPrompt: string;
    /** Editable "keyword: weight" lines, one per decision pattern. */
    decisionPatternsText: string;
    /** '' = engine default (prefer_local). */
    preferredRoutingStrategy: string;
    /** Empty = unrestricted — the engine treats [] the same as unset (falsy check). */
    toolWhitelist: string[];
}

/** The common tool set surfaced as checkboxes — see core/builtin_tools.py. Checking
 * a tool the agent's own role/task never grants is harmless: the engine's whitelist
 * can only NARROW an allowlist, never add to it (Worker.execute() in core/worker.py). */
export const TOOL_WHITELIST_OPTIONS: readonly string[] = [
    'file_read', 'file_write', 'list_directory', 'project_search',
    'shell_exec', 'shell_job_status', 'shell_job_stop',
    'web_fetch', 'http_request', 'generate_document',
    'check_security_headers', 'port_scan',
];

/** Same 4 values/labels as soriku-chat's ROUTING_OPTIONS (kept separate — that
 * one also carries per-option hint text for the chat header control). Keep the
 * value/label pairs in sync if the engine's RoutingStrategy set ever changes. */
export const ROUTING_STRATEGY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'prefer_local', label: 'Local-first' },
    { value: 'local_with_remote_conductor', label: 'Hybrid' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'prefer_quality', label: 'Best' },
];

/** Read `memory.decision_patterns.patterns` defensively into "keyword: weight" lines. */
export function decisionPatternsToText(persona: AgentPersona): string {
    const raw = persona as unknown as Record<string, unknown>;
    const memory = (raw.memory && typeof raw.memory === 'object' ? raw.memory : {}) as Record<string, unknown>;
    const dp = (memory.decision_patterns && typeof memory.decision_patterns === 'object'
        ? memory.decision_patterns : {}) as Record<string, unknown>;
    const patterns = (dp.patterns && typeof dp.patterns === 'object' ? dp.patterns : {}) as Record<string, unknown>;
    return Object.entries(patterns)
        .filter(([, w]) => typeof w === 'number')
        .map(([k, w]) => `${k}: ${w as number}`)
        .join('\n');
}

/** Parse "keyword: weight" lines into a {keyword: weight in [0,1]} map (drops invalid lines). */
export function parseDecisionPatterns(text: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const line of (text || '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        const idx = trimmed.lastIndexOf(':');
        if (idx <= 0) {
            continue;
        }
        const key = trimmed.slice(0, idx).trim();
        const weight = Number(trimmed.slice(idx + 1).trim());
        if (key && Number.isFinite(weight)) {
            out[key] = Math.max(0, Math.min(1, weight));
        }
    }
    return out;
}

export function toAgentForm(persona: AgentPersona): AgentForm {
    return {
        name: persona.name ?? '',
        role: persona.role ?? '',
        description: persona.persona?.description ?? '',
        preferredModel: persona.preferred_model ?? '',
        visibility: persona.simezu?.visibility ?? '',
        systemPrompt: persona.intelligence?.system_prompt ?? '',
        decisionPatternsText: decisionPatternsToText(persona),
        preferredRoutingStrategy: persona.preferred_routing_strategy ?? '',
        toolWhitelist: persona.tool_whitelist ?? [],
    };
}

export interface QualityScore {
    category: string;
    ratio: number;
    count: number;
}

/** Read-only summary of what an agent has learned, for display. */
export interface LearningSummary {
    feedbackRules: string[];
    qualityScores: QualityScore[];
    stack: string[];
    interactions: number;
    positive: number;
    negative: number;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/**
 * Extract the learned signals from a raw agent payload (defensive — the engine's
 * shapes are richer than the simplified client types): feedback-promoted domain
 * rules, per-category quality ratios, confirmed tech stack, and feedback stats.
 */
export function summarizeLearning(persona: AgentPersona): LearningSummary {
    const raw = persona as unknown as Record<string, unknown>;
    const intelligence = asRecord(raw.intelligence);
    const learning = asRecord(raw.learning);
    const memory = asRecord(raw.memory);
    const stats = asRecord(raw.stats);

    const feedbackRules: string[] = [];
    for (const r of (Array.isArray(intelligence.domain_rules) ? intelligence.domain_rules : [])) {
        const rule = asRecord(r);
        if (rule.source === 'feedback' && typeof rule.rule === 'string') {
            feedbackRules.push(rule.rule);
        }
    }

    const qualityScores: QualityScore[] = [];
    const scores = asRecord(learning.quality_scores);
    for (const [category, bucket] of Object.entries(scores)) {
        const b = asRecord(bucket);
        if (typeof b.ratio === 'number' && typeof b.count === 'number') {
            qualityScores.push({ category, ratio: b.ratio, count: b.count });
        }
    }

    const fingerprint = asRecord(memory.stack_fingerprint);
    const stack = Array.isArray(fingerprint.confirmed) ? fingerprint.confirmed.filter((s): s is string => typeof s === 'string') : [];

    const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
    return {
        feedbackRules,
        qualityScores,
        stack,
        interactions: num(stats.interactions),
        positive: num(stats.positive_feedback),
        negative: num(stats.negative_feedback),
    };
}

/** Build the PATCH body. Visibility is only sent when set (engine ignores empty). */
export function buildUpdateRequest(form: AgentForm): AgentUpdateRequest {
    const body: AgentUpdateRequest = {
        name: form.name.trim(),
        role: form.role.trim(),
        description: form.description,
        preferred_model: form.preferredModel.trim(),
        system_prompt: form.systemPrompt,
    };
    const visibility = form.visibility.trim();
    if (visibility) {
        body.visibility = visibility;
    }
    body.decision_patterns = parseDecisionPatterns(form.decisionPatternsText);
    const routingStrategy = form.preferredRoutingStrategy.trim();
    if (routingStrategy) {
        body.preferred_routing_strategy = routingStrategy;
    }
    body.tool_whitelist = form.toolWhitelist;
    return body;
}
