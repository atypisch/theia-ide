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
