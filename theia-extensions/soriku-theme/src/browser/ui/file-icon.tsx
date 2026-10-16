/********************************************************************************
 * Soriku IDE — file-type icon (port of `fIcon()` in the v2 mockup). The kind is
 * decided by the pure `fileIconKind()`; this component only draws it.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { fileIconKind, FileIconKind } from '../../common/file-icon-kind';
import { SorikuMark } from './SorikuMark';

export interface FileIconProps {
    name: string;
    size?: number;
}

const stroke = (children: React.ReactNode, color: string, s: number): React.ReactElement => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>{children}</svg>
);

function draw(kind: FileIconKind, s: number): React.ReactElement {
    switch (kind) {
        case 'chat':
            return <SorikuMark size={s + 1} />;
        case 'plan':
            return stroke(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>, 'var(--cat-reason)', s);
        case 'db':
            return (
                <svg width={s} height={s} viewBox="0 0 24 24" fill="#E8679A" stroke="none" style={{ display: 'block', flexShrink: 0 }}>
                    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
                    <path d="M4 8.6c0 1.7 3.6 3 8 3s8-1.3 8-3v3.3c0 1.7-3.6 3-8 3s-8-1.3-8-3z" />
                    <path d="M4 15.4c0 1.7 3.6 3 8 3s8-1.3 8-3v3.1c0 1.7-3.6 3-8 3s-8-1.3-8-3z" />
                </svg>
            );
        case 'code':
        case 'code-test':
            return stroke(<><polyline points="8.5 7 3.5 12 8.5 17" /><polyline points="15.5 7 20.5 12 15.5 17" /></>,
                kind === 'code-test' ? 'var(--cat-general)' : 'var(--acc2)', s);
        case 'config':
            return stroke(<>
                <path d="M8 4C6 4 5 5 5 7v2c0 1.2-.8 2-2 2 1.2 0 2 .8 2 2v2c0 2 1 3 3 3" />
                <path d="M16 4c2 0 3 1 3 3v2c0 1.2.8 2 2 2-1.2 0-2 .8-2 2v2c0 2-1 3-3 3" />
            </>, 'var(--ink3)', s);
        default:
            return stroke(<path d="M4 6h16M4 10h16M4 14h10M4 18h13" />, 'var(--ink3)', s);
    }
}

export function FileIcon({ name, size = 13 }: FileIconProps): React.ReactElement {
    return draw(fileIconKind(name), size);
}
