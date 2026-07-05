/********************************************************************************
 * Soriku IDE — agent avatar (initials + category color), 1:1 from the mockup
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { AgentCategory, categoryColors } from './category';

export type AgentAvatarSize = 'sm' | 'md' | 'lg';

export interface AgentAvatarProps {
    /** One or two letters, e.g. "Ko" for Koda. */
    initials: string;
    category: AgentCategory;
    size?: AgentAvatarSize;
}

const SIZE_PX: Record<AgentAvatarSize, { box: number; font: number; radius: number }> = {
    sm: { box: 22, font: 9.5, radius: 6 },
    md: { box: 34, font: 12, radius: 9 },
    lg: { box: 52, font: 18, radius: 14 },
};

export function AgentAvatar({ initials, category, size = 'md' }: AgentAvatarProps): React.ReactElement {
    const { c, bg, line } = categoryColors(category);
    const dims = SIZE_PX[size];
    return (
        <div
            className="sk-avatar"
            style={{
                width: dims.box,
                height: dims.box,
                borderRadius: dims.radius,
                fontSize: dims.font,
                background: bg,
                color: c,
                borderColor: line,
            }}
        >
            {initials}
        </div>
    );
}
