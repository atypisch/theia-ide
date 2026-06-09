/********************************************************************************
 * Soriku IDE — auth status model (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { WhoamiResponse } from 'soriku-engine-client-ext/lib/common/engine-types';

export type EngineAuthMode = 'local' | 'simezu' | 'unknown';

export interface AuthState {
    /** Engine auth mode as reported by `/api/auth/mode`. */
    mode: EngineAuthMode;
    /** Whether a bearer token is currently stored. */
    hasToken: boolean;
    /** Display name of the signed-in user (simezu mode, validated via whoami). */
    user?: string;
    /** Human-readable error from the last refresh (engine unreachable, invalid token, …). */
    error?: string;
}

export interface AuthStatusView {
    /** Plain status text (no icons — the contribution adds codicons). */
    text: string;
    tooltip: string;
}

export const LOCAL_STATE: AuthState = { mode: 'local', hasToken: false };

/** Map a raw `auth_mode` string from the engine to a known mode. */
export function normalizeAuthMode(raw: string | undefined): EngineAuthMode {
    if (raw === 'local') {
        return 'local';
    }
    if (raw === 'simezu') {
        return 'simezu';
    }
    return 'unknown';
}

/** Choose the best available display name from a whoami response. */
export function pickUserName(whoami: WhoamiResponse | undefined): string | undefined {
    if (!whoami) {
        return undefined;
    }
    const candidate = whoami.display_name ?? whoami.name ?? whoami.email ?? whoami.user_id;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/**
 * Derive the status-bar text/tooltip from the current auth state.
 * Pure and deterministic so it can be unit-tested without Theia.
 */
export function computeStatusView(state: AuthState): AuthStatusView {
    if (state.mode === 'local') {
        return {
            text: 'Local mode',
            tooltip: 'Soriku engine is in local mode — no sign-in required.',
        };
    }
    if (state.error) {
        return {
            text: 'Soriku: auth error',
            tooltip: state.error,
        };
    }
    if (state.mode === 'simezu' && state.hasToken && state.user) {
        return {
            text: `Connected as ${state.user}`,
            tooltip: 'Connected to Simezu. Click to manage the connection.',
        };
    }
    if (state.mode === 'simezu' && state.hasToken) {
        return {
            text: 'Connected to Simezu',
            tooltip: 'Connected to Simezu. Click to manage the connection.',
        };
    }
    if (state.mode === 'simezu') {
        return {
            text: 'Connect to Simezu',
            tooltip: 'Click to connect with a Simezu API key.',
        };
    }
    return {
        text: 'Soriku: engine unknown',
        tooltip: 'Could not reach the Soriku engine. Click to manage the connection.',
    };
}
