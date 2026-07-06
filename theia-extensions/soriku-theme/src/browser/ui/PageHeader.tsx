/********************************************************************************
 * Soriku IDE — full-page view header (eyebrow + italic heading + subhead),
 * 1:1 from the mockup's Agents/Models/Capability Map/… section headers.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface PageHeaderProps {
    /** Small uppercase mono label with a leading accent dot, e.g. "Soriku engine". */
    eyebrow: string;
    /** Plain heading text; `emphasis` renders italic (font-d) as the mockup's <span class="sk-em">. */
    heading: string;
    emphasis: string;
    subhead: string;
    /** Buttons/pills placed at the header's trailing edge. */
    actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, heading, emphasis, subhead, actions }: PageHeaderProps): React.ReactElement {
    return (
        <div className="sk-page-header">
            <div className="sk-page-header-main">
                <div className="sk-page-header-eyebrow"><span className="sk-page-header-eyebrow-dot" />{eyebrow}</div>
                <div className="sk-page-header-heading">{heading} <span className="sk-em">{emphasis}</span></div>
                <div className="sk-page-header-subhead">{subhead}</div>
            </div>
            {actions && <div className="sk-page-header-actions">{actions}</div>}
        </div>
    );
}
