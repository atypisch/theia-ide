/********************************************************************************
 * Soriku IDE — capability map table model (pure, Theia-free, unit-testable)
 *
 * Shapes the engine's /api/capabilities payload (models[modelId][category].score)
 * into a sortable models × categories table.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { CapabilityMapResponse } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface CapabilityRow {
    model: string;
    aggregate?: number;
    stale?: boolean;
    scores: Record<string, number | undefined>;
}

export interface CapabilityTableMeta {
    source?: string;
    updatedAt?: string;
    stale?: boolean;
}

export interface CapabilityTable {
    categories: string[];
    rows: CapabilityRow[];
    meta?: CapabilityTableMeta;
    empty: boolean;
}

/** Pseudo-columns usable as a sort key in addition to the category columns. */
export type CapabilitySortKey = 'model' | 'aggregate' | string;

function scoreOf(value: unknown): number | undefined {
    // eslint-disable-next-line no-null/no-null
    if (typeof value === 'object' && value !== null && 'score' in value) {
        const score = (value as Record<string, unknown>).score;
        return typeof score === 'number' ? score : undefined;
    }
    return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    // eslint-disable-next-line no-null/no-null
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

export function toCapabilityTable(response: CapabilityMapResponse): CapabilityTable {
    const modelsObj = asRecord(response.models) ?? {};
    const categorySet = new Set<string>();
    const rows: CapabilityRow[] = [];

    for (const [model, raw] of Object.entries(modelsObj)) {
        const cats = asRecord(raw) ?? {};
        const scores: Record<string, number | undefined> = {};
        let aggregate: number | undefined;
        let stale: boolean | undefined;
        for (const [key, value] of Object.entries(cats)) {
            if (key === 'stale') {
                stale = typeof value === 'boolean' ? value : undefined;
                continue;
            }
            if (key === '_aggregate') {
                aggregate = scoreOf(value);
                continue;
            }
            if (key.startsWith('_')) {
                continue;
            }
            const score = scoreOf(value);
            if (score !== undefined) {
                scores[key] = score;
                categorySet.add(key);
            }
        }
        rows.push({ model, aggregate, stale, scores });
    }

    const meta = asRecord(response.meta);
    return {
        categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
        rows,
        empty: rows.length === 0,
        meta: meta ? {
            source: typeof meta.source === 'string' ? meta.source : undefined,
            updatedAt: typeof meta.updated_at === 'string' ? meta.updated_at : undefined,
            stale: typeof meta.stale === 'boolean' ? meta.stale : undefined,
        } : undefined,
    };
}

/** Highest real score per category column — the heatmap's "best in category" outline. */
export function columnMaxima(table: CapabilityTable): Record<string, number> {
    const maxima: Record<string, number> = {};
    for (const cat of table.categories) {
        const scores = table.rows.map(r => r.scores[cat]).filter((v): v is number => v !== undefined);
        maxima[cat] = scores.length > 0 ? Math.max(...scores) : -Infinity;
    }
    return maxima;
}

/** Sort rows by a category score (or by `model`/`aggregate`); missing scores sort last. */
export function sortRows(rows: CapabilityRow[], sortBy: CapabilitySortKey, descending = true): CapabilityRow[] {
    const copy = rows.slice();
    copy.sort((a, b) => {
        if (sortBy === 'model') {
            return descending ? b.model.localeCompare(a.model) : a.model.localeCompare(b.model);
        }
        const av = sortBy === 'aggregate' ? a.aggregate : a.scores[sortBy];
        const bv = sortBy === 'aggregate' ? b.aggregate : b.scores[sortBy];
        const an = av ?? Number.NEGATIVE_INFINITY;
        const bn = bv ?? Number.NEGATIVE_INFINITY;
        return descending ? bn - an : an - bn;
    });
    return copy;
}
