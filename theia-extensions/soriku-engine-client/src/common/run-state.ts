/********************************************************************************
 * Soriku IDE — run-state snapshot shared between the chat and the status bar (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * What the status bar needs to know about the latest agent run, without depending on
 * the chat extension. The chat publishes one of these whenever its newest turn changes.
 */
export interface RunStateSnapshot {
    running: boolean;
    /** Result of the engine's verify checks on the latest run. `none` = nothing was verified. */
    verified: 'none' | 'verified' | 'failed';
    workers: number;
    minions: number;
}

export const IDLE_RUN_STATE: RunStateSnapshot = { running: false, verified: 'none', workers: 0, minions: 0 };

/** "1 worker · 2 minions" (design status bar). `minionLabel` is the user's preferred term for sub-agents. */
export function formatWorkerCounts(s: RunStateSnapshot, minionLabel = 'minions'): string {
    if (s.workers === 0 && s.minions === 0) { return ''; }
    const parts: string[] = [];
    if (s.workers > 0) { parts.push(`${s.workers} ${s.workers === 1 ? 'worker' : 'workers'}`); }
    if (s.minions > 0) {
        const singular = minionLabel.replace(/s$/, '');
        parts.push(`${s.minions} ${s.minions === 1 ? singular : minionLabel}`);
    }
    return parts.join(' · ');
}

export function sameRunState(a: RunStateSnapshot, b: RunStateSnapshot): boolean {
    return a.running === b.running && a.verified === b.verified && a.workers === b.workers && a.minions === b.minions;
}
