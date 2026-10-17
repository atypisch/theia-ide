/********************************************************************************
 * Soriku IDE — Agents panel view helpers (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { RunAgentView } from 'soriku-engine-client-ext/lib/common/run-state';

export interface AgentRowStatus {
    text: string;
    tone: 'work' | 'done' | 'error' | 'idle';
    pulse: boolean;
}

/** The status line under an agent in "This run": what it is doing now, or how it ended. */
export function agentRowStatus(a: RunAgentView): AgentRowStatus {
    if (a.status === 'error') { return { text: 'Failed', tone: 'error', pulse: false }; }
    if (a.status === 'running') { return { text: a.activity ?? 'Working', tone: 'work', pulse: true }; }
    return { text: a.files > 0 ? `Done · ${a.files} ${a.files === 1 ? 'file' : 'files'}` : 'Done', tone: 'done', pulse: false };
}

/** "just now" / "5m" / "3h" / "2d" / a short date, for the sessions list. */
export function relativeWhen(iso: string | undefined, now: Date = new Date()): string {
    if (!iso) { return ''; }
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) { return ''; }
    const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
    if (s < 45) { return 'just now'; }
    if (s < 3600) { return `${Math.round(s / 60)}m ago`; }
    if (s < 86400) { return `${Math.round(s / 3600)}h ago`; }
    if (s < 7 * 86400) { return `${Math.round(s / 86400)}d ago`; }
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
