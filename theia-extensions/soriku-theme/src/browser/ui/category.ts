/********************************************************************************
 * Soriku IDE — agent category → color mapping (1:1 from the mockup's `cat()`)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type AgentCategory = 'coding' | 'reasoning' | 'general';

export interface CategoryColors {
    /** Foreground / accent color for this category. */
    c: string;
    /** Soft background (18% mix over transparent) for avatars/badges. */
    bg: string;
    /** Border color (40% mix over transparent). */
    line: string;
}

const CATEGORY_VAR: Record<AgentCategory, string> = {
    coding: 'var(--cat-code)',
    reasoning: 'var(--cat-reason)',
    general: 'var(--cat-general)',
};

/** Mirrors the mockup's `cat(name)` helper exactly (color-mix over transparent). */
export function categoryColors(category: AgentCategory): CategoryColors {
    const c = CATEGORY_VAR[category];
    return {
        c,
        bg: `color-mix(in srgb, ${c} 18%, transparent)`,
        line: `color-mix(in srgb, ${c} 40%, transparent)`,
    };
}
