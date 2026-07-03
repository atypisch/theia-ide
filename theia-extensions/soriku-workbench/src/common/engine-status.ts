/********************************************************************************
 * Soriku IDE — engine connection status model (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type EngineConnectionStatus = 'idle' | 'connecting' | 'connected' | 'unreachable';

export interface EngineConnectionState {
    status: EngineConnectionStatus;
    baseUrl: string;
    error?: string;
}

export interface EngineStatusView {
    text: string;
    tooltip: string;
}

/** Host[:port] of a base URL, falling back to the raw string. */
export function shortHost(baseUrl: string): string {
    try {
        return new URL(baseUrl).host || baseUrl;
    } catch {
        return baseUrl;
    }
}

/** Plain status-bar text/tooltip (the contribution prepends codicons). */
export function computeEngineStatusView(state: EngineConnectionState): EngineStatusView {
    const host = shortHost(state.baseUrl);
    if (state.status === 'idle') {
        return { text: 'Soriku: not connected', tooltip: 'Not connected to the Soriku engine. Click to connect.' };
    }
    if (state.status === 'connecting') {
        return { text: 'Soriku: connecting…', tooltip: `Connecting to the Soriku engine at ${state.baseUrl}…` };
    }
    if (state.status === 'connected') {
        return { text: `Soriku: ${host}`, tooltip: `Connected to the Soriku engine at ${state.baseUrl}.` };
    }
    return {
        text: 'Engine unreachable',
        tooltip: state.error
            ? `Cannot reach the Soriku engine at ${state.baseUrl}: ${state.error}`
            : `Cannot reach the Soriku engine at ${state.baseUrl}.`,
    };
}

/** First-run welcome choice for connecting to the engine. */
export type FirstRunChoice = 'local' | 'hosted' | 'skip';

/** What the contribution should do for a given first-run choice (pure, side-effect-free). */
export interface FirstRunAction {
    /** Persist this engine base URL before connecting, if set. */
    setBaseUrl?: string;
    /** Start the hosted (Simezu) sign-in flow. */
    startHostedAuth: boolean;
    /** Ping the engine afterwards to update the status bar. */
    connect: boolean;
}

/** Map a first-run choice to the concrete actions to perform. */
export function firstRunAction(choice: FirstRunChoice, localBaseUrl: string): FirstRunAction {
    if (choice === 'local') {
        return { setBaseUrl: localBaseUrl, startHostedAuth: false, connect: true };
    }
    if (choice === 'hosted') {
        return { startHostedAuth: true, connect: false };
    }
    return { startHostedAuth: false, connect: false };
}

// ── Health monitoring (#9/#13) ──────────────────────────────────────────────

/** Routine health-poll interval while connected. */
export const HEALTH_POLL_MS = 30_000;
/** First reconnect attempt after a failure. */
export const RECONNECT_BASE_MS = 2_000;
/** Backoff ceiling — a permanently-down engine is probed at most this often. */
export const RECONNECT_MAX_MS = 60_000;

/**
 * Delay until the next health probe (pure, testable): steady polling while
 * connected; exponential backoff (base·2^attempts, capped) while unreachable —
 * so a down engine is detected AND a recovered engine is noticed without a
 * manual reconnect (#13), without hammering a dead host.
 */
export function nextProbeDelay(status: EngineConnectionStatus, failedAttempts: number): number {
    if (status === 'connected') {
        return HEALTH_POLL_MS;
    }
    const exp = Math.min(Math.max(failedAttempts, 0), 10);   // 2^10 guard against overflow
    return Math.min(RECONNECT_BASE_MS * Math.pow(2, exp), RECONNECT_MAX_MS);
}
