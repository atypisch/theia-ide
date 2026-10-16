/********************************************************************************
 * Soriku IDE — inline Lucide-style icons used by the v2 design (24 viewBox,
 * stroke 1.7). Paths are copied 1:1 from `Soriku IDE v2.dc.html` (navDefs,
 * ~l.1969). Add further icons here as the views that need them are built — do
 * not inline ad-hoc SVGs in widgets.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export type SorikuIconName =
    | 'explorer' | 'search' | 'scm' | 'agents' | 'models' | 'capmap' | 'mcp' | 'routing' | 'conversations';

const PATHS: Record<SorikuIconName, React.ReactNode> = {
    explorer: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    scm: <><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></>,
    agents: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    models: <><path d="M12 2 2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
    capmap: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    mcp: <><rect x="2" y="3" width="20" height="7" rx="1.5" /><rect x="2" y="14" width="20" height="7" rx="1.5" />
        <line x1="6" y1="6.5" x2="6.01" y2="6.5" /><line x1="6" y1="17.5" x2="6.01" y2="17.5" /></>,
    routing: <><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.4 6H14a4 4 0 0 1 4 4v5.6" /></>,
    conversations: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
};

export interface SorikuIconProps {
    name: SorikuIconName;
    size?: number;
    strokeWidth?: number;
}

export function SorikuIcon({ name, size = 16, strokeWidth = 1.7 }: SorikuIconProps): React.ReactElement {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={strokeWidth} style={{ display: 'block', flexShrink: 0 }}>
            {PATHS[name]}
        </svg>
    );
}
