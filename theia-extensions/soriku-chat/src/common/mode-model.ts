/********************************************************************************
 * Soriku IDE — mode + model pickers → request fields (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ChatMode, RoutingStrategy } from 'soriku-engine-client-ext/lib/common/engine-types';

/** v2 composer "Mode" pill. Agent writes code, Plan proposes first, Ask never changes files. */
export type ChatModeChoice = 'agent' | 'plan' | 'ask';
/** v2 routing radio under Model → Auto. */
export type RoutingChoice = 'local_first' | 'hybrid' | 'best';

export type ModelSelection =
    | { kind: 'auto'; routing: RoutingChoice }
    | { kind: 'single'; modelId?: string }
    | { kind: 'multiple'; modelIds: string[] };

export const MAX_MULTIPLE_MODELS = 3;
export const DEFAULT_MODE: ChatModeChoice = 'plan';
export const DEFAULT_MODEL: ModelSelection = { kind: 'auto', routing: 'local_first' };

export const ROUTING_STRATEGY: Record<RoutingChoice, RoutingStrategy> = {
    local_first: 'prefer_local',
    hybrid: 'local_with_remote_conductor',
    best: 'prefer_quality',
};

export interface ResolvedRun {
    mode: ChatMode;
    /** false = chat-only: no client tools, no file edits. */
    editsEnabled: boolean;
    modelId?: string;
    /** Compare run: one worker per ticked model on the same prompt (engine plan, no planning step). */
    workerModels?: string[];
    /** false parks the plan for approval; undefined leaves the engine default. */
    planAutoExecute?: boolean;
    routingStrategy?: RoutingStrategy;
}

/** Toggles a model in a Multiple selection, capped at MAX_MULTIPLE_MODELS (extra ticks are ignored). */
export function toggleMultiple(ids: string[], id: string): string[] {
    if (ids.includes(id)) { return ids.filter(x => x !== id); }
    return ids.length >= MAX_MULTIPLE_MODELS ? ids : [...ids, id];
}

/**
 * Maps the two v2 pickers onto the engine's request fields. Behaviour preserved
 * from the previous Do/Model/Route/Plan-by segments:
 *  - Agent acts directly (`single` mode — the router still picks the model).
 *  - Plan parks the plan for approval, except Multiple which is a compare run
 *    (nothing to approve — the user already chose the models).
 *  - Ask is chat-only.
 *  - A forced model (Single/Multiple) overrides routing, so no strategy is sent.
 */
export function resolveRun(mode: ChatModeChoice, model: ModelSelection): ResolvedRun {
    const editsEnabled = mode !== 'ask';
    const compare = model.kind === 'multiple' && model.modelIds.length >= 2;
    const singleId = model.kind === 'single' ? model.modelId
        : model.kind === 'multiple' && model.modelIds.length === 1 ? model.modelIds[0] : undefined;

    if (compare) {
        return { mode: 'plan', editsEnabled, workerModels: (model as { modelIds: string[] }).modelIds.slice(0, MAX_MULTIPLE_MODELS) };
    }
    const routingStrategy = model.kind === 'auto' ? ROUTING_STRATEGY[model.routing] : undefined;
    if (mode === 'plan') {
        return { mode: 'plan', editsEnabled, planAutoExecute: false, routingStrategy, modelId: undefined };
    }
    if (singleId) {
        return { mode: 'single', editsEnabled, modelId: singleId };
    }
    return { mode: mode === 'agent' ? 'single' : 'auto', editsEnabled, routingStrategy };
}

/** Composer placeholder (v2 l.2537) — verbatim from the design. */
export function placeholderFor(mode: ChatModeChoice, followUp = false): string {
    if (followUp) { return 'Follow up on this session…'; }
    if (mode === 'ask') { return 'Ask anything about this codebase…'; }
    return mode === 'plan' ? 'Describe a change — you\'ll approve the plan first…' : 'Describe a change…';
}
