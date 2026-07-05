/********************************************************************************
 * Soriku IDE — generic overlay/modal frame (Documentation, Shortcuts, Plan
 * detail, Promote subagent, About, …), 1:1 from the mockup's overlay backdrop.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface OverlayProps {
    onClose: () => void;
    children: React.ReactNode;
    /** Inline style overrides for the frame (width/height vary per overlay). */
    frameStyle?: React.CSSProperties;
}

export function Overlay({ onClose, children, frameStyle }: OverlayProps): React.ReactElement {
    const stop = (e: React.MouseEvent): void => e.stopPropagation();
    return (
        <div className="sk-overlay-backdrop" onClick={onClose}>
            <div className="sk-overlay-frame" style={frameStyle} onClick={stop}>
                {children}
            </div>
        </div>
    );
}
