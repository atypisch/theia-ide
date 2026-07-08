/********************************************************************************
 * Soriku IDE — generic sidebar side-info panel: an eyebrow label plus a
 * handful of icon/key/value stat rows, reused for the Agents/Models/
 * Capability Map/MCP Servers/Routing/Settings nav-item context panels.
 *
 * Every row here must come from a real engine call — there is no
 * placeholder-number mode. Callers that don't have a real source for a
 * mockup stat (e.g. Agents' "Running now" / Models' "Hardware") simply
 * don't pass that row, same precedent as the Agents grid's deliberately
 * omitted "New agent" button.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface InfoPanelStat {
    icon: string;
    label: string;
    value: string;
}

export interface SorikuSidebarInfoPanelProps {
    eyebrow: string;
    status: 'loading' | 'error' | 'ready';
    error?: string;
    stats: InfoPanelStat[];
    footerNote?: string;
    onRetry?: () => void;
}

export function SorikuSidebarInfoPanel(props: SorikuSidebarInfoPanelProps): React.ReactElement {
    return (
        <div className="soriku-sidebar-info-panel">
            <div className="soriku-sidebar-info-eyebrow">{props.eyebrow}</div>
            {props.status === 'loading' && <div className="soriku-sidebar-info-loading">Loading…</div>}
            {props.status === 'error' && (
                <div className="soriku-sidebar-info-error">
                    <div>Could not load.</div>
                    {props.error && <div className="soriku-sidebar-info-error-detail">{props.error}</div>}
                    {props.onRetry && (
                        <button className="soriku-sidebar-info-retry" onClick={props.onRetry}>Retry</button>
                    )}
                </div>
            )}
            {props.status === 'ready' && (
                <div className="soriku-sidebar-info-rows">
                    {props.stats.map(stat => (
                        <div className="soriku-sidebar-info-row" key={stat.label}>
                            <span className={`codicon ${stat.icon} soriku-sidebar-info-row-icon`} />
                            <span className="soriku-sidebar-info-row-label">{stat.label}</span>
                            <span className="soriku-sidebar-info-row-value">{stat.value}</span>
                        </div>
                    ))}
                </div>
            )}
            {props.footerNote && <div className="soriku-sidebar-info-footer">{props.footerNote}</div>}
        </div>
    );
}
