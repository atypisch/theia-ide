/********************************************************************************
 * Soriku IDE — routing overrides model (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { RoutingOverridesResponse, V1ModelsResponse } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface OverrideRow {
    category: string;
    modelId: string;
}

/** Extract the user-level category -> model overrides from the engine response. */
export function parseOverrides(response: RoutingOverridesResponse): OverrideRow[] {
    const list = Array.isArray(response.overrides) ? response.overrides : [];
    return list
        .map(o => ({
            category: typeof o.category === 'string' ? o.category : String(o.category ?? ''),
            modelId: typeof o.model_id === 'string' ? o.model_id : String(o.model_id ?? ''),
        }))
        .filter(row => row.category.length > 0 && row.modelId.length > 0);
}

/** Model ids for the force-model dropdown. */
export function parseModelIds(response: V1ModelsResponse): string[] {
    const data = Array.isArray(response.data) ? response.data : [];
    return data.map(m => m.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export interface RoutingCategoryRow {
    category: string;
    /** The user override for this category, or undefined when it's on Auto. */
    override?: string;
}

/**
 * Merges the engine's known categories (from the capability map — the same
 * grid the router itself scores against) with the user's sparse override
 * list, into one row per category: 1:1 with the mockup's fixed grid
 * ("Auto" vs a forced model), built entirely from real data rather than a
 * hand-picked category list.
 */
export function mergeCategoryRows(allCategories: string[], overrides: OverrideRow[]): RoutingCategoryRow[] {
    const overrideByCategory = new Map(overrides.map(o => [o.category, o.modelId]));
    return allCategories
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map(category => ({ category, override: overrideByCategory.get(category) }));
}

