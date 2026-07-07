/********************************************************************************
 * Soriku IDE — sidebar footer account view (pure, Theia-free, testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AuthState } from 'soriku-auth-ext/lib/common/auth-status';

export interface SidebarAccountView {
    avatarText: string;
    name: string;
    subtitle: string;
}

/** Two initials from a display name/email ("Marten Timan" -> "MT"), else a single-letter fallback. */
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * The sidebar footer only has room for a quick glance (name + one-line status) —
 * the Settings "Account & Plan" section owns the full picture (real plan tier,
 * teams, billing). Local mode keeps the mockup's static "Local · Free plan"
 * since local truly has no billing concept beyond it; Simezu mode reflects the
 * real, already-loaded SorikuAuthService state instead of guessing a plan tier
 * that would need a separate billing call to know for sure.
 */
export function sidebarAccountView(state: AuthState): SidebarAccountView {
    if (state.mode === 'local') {
        return { avatarText: 'You', name: 'Account', subtitle: 'Local · Free plan' };
    }
    if (state.error) {
        return { avatarText: '!', name: 'Account', subtitle: 'Connection error' };
    }
    if (state.mode === 'simezu' && state.hasToken && state.user) {
        return { avatarText: initials(state.user), name: state.user, subtitle: 'Connected to Simezu' };
    }
    if (state.mode === 'simezu' && state.hasToken) {
        return { avatarText: 'You', name: 'Account', subtitle: 'Connecting…' };
    }
    if (state.mode === 'simezu') {
        return { avatarText: 'You', name: 'Account', subtitle: 'Connect to Simezu' };
    }
    return { avatarText: 'You', name: 'Account', subtitle: 'Local · Free plan' };
}
