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

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

export function validateNewOverride(category: string, modelId: string): ValidationResult {
    if (!category.trim()) {
        return { ok: false, error: 'Enter a category (e.g. code_generation).' };
    }
    if (!modelId.trim()) {
        return { ok: false, error: 'Choose a model.' };
    }
    return { ok: true };
}
