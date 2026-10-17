/********************************************************************************
 * Soriku IDE — banner shown while soriku.md is new or changed and not yet approved.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface InstructionsBannerProps {
    files: string[];
    /** Whether an earlier approved version keeps being used meanwhile. */
    hasApprovedVersion: boolean;
    signals: string[];
    onOpen: () => void;
    onApprove: () => void;
}

export function InstructionsBanner(p: InstructionsBannerProps): React.ReactElement {
    const name = p.files.length > 0 ? p.files.join(' + ') : 'soriku.md';
    return (
        <div className="sk-notice sk-notice-warn">
            <div><b>{name}</b> is new or has changed since you last approved it.
                {p.hasApprovedVersion ? ' Agents keep using the previously approved version until you approve this one.' : ' Agents do not use it until you approve it.'}</div>
            {p.signals.length > 0 && <div style={{ marginTop: 6 }}>Looks suspicious: {p.signals.join('; ')}.</div>}
            <div style={{ marginTop: 8 }}>
                <button className="sk-btn" onClick={p.onOpen}>Review file</button>
                <button className="sk-btn sk-btn-primary" onClick={p.onApprove}>Approve</button>
            </div>
        </div>
    );
}
