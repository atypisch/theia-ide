/********************************************************************************
 * Soriku IDE — engine connection status model (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type EngineConnectionStatus = 'connecting' | 'connected' | 'unreachable';

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
