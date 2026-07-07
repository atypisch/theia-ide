/********************************************************************************
 * Soriku IDE — Settings page view helpers (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** Format the cloud-cost-cap preference for display. Negative means "use the engine's own default". */
export function formatCostCap(value: number): string {
    if (value < 0) {
        return 'Engine default';
    }
    return `€${value.toFixed(2)}`;
}

export interface WarmModelsCount {
    warm: number;
    total: number;
}

/** How many installed models are currently loaded (warm) in memory. */
export function countWarmModels(models: ReadonlyArray<{ is_running?: boolean }>): WarmModelsCount {
    return {
        warm: models.filter(m => m.is_running).length,
        total: models.length,
    };
}

const CONNECTION_LABELS: Record<string, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    unreachable: 'Unreachable',
    idle: 'Not connected',
};

/** Human label for the Settings page's live "Connection" row. */
export function connectionLabel(status: string): string {
    return CONNECTION_LABELS[status] ?? 'Not connected';
}

/** "priority_routing" -> "Priority routing" — for core/billing/plans.py's snake_case feature keys. */
export function featureLabel(feature: string): string {
    const words = feature.split('_').filter(Boolean);
    if (words.length === 0) {
        return feature;
    }
    return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

/** Extract a friendly message from a thrown EngineError's parsed body, falling back to its own message. */
export function engineErrorMessage(error: unknown): string {
    const body = (error as { body?: unknown } | undefined)?.body;
    if (body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string') {
        return (body as { message: string }).message;
    }
    return error instanceof Error ? error.message : String(error);
}
