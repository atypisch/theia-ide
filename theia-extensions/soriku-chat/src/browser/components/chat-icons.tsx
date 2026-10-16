/********************************************************************************
 * Soriku IDE — chat icons, paths 1:1 from Soriku IDE v2.dc.html
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/* eslint-disable max-len -- verbatim vector path data copied from the design */
import * as React from '@theia/core/shared/react';
import { StepKind } from '../../common/run-timeline';

interface SvgProps {
    size?: number;
    sw?: number;
    color?: string;
    round?: boolean;
    children: React.ReactNode;
}

function Svg({ size = 14, sw = 1.7, color = 'currentColor', round, children }: SvgProps): React.ReactElement {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}
            strokeLinecap={round ? 'round' : undefined} strokeLinejoin={round ? 'round' : undefined} style={{ display: 'block', flexShrink: 0 }}>
            {children}
        </svg>
    );
}

export const HistoryIcon = (): React.ReactElement => <Svg size={15}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></Svg>;
export const PlusIcon = (): React.ReactElement => <Svg size={15}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>;
export const DockIcon = (): React.ReactElement => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></Svg>;
export const TabIcon = (): React.ReactElement => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v6" /></Svg>;
export const MaxIcon = ({ maxed }: { maxed: boolean }): React.ReactElement => maxed
    ? <Svg><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></Svg>
    : <Svg><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /></Svg>;
export const BulbIcon = (): React.ReactElement => <Svg size={15}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></Svg>;
export const PenIcon = ({ size = 10 }: { size?: number }): React.ReactElement => <Svg size={size} sw={2}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
export const DocIcon = ({ size = 12, color }: { size?: number; color?: string }): React.ReactElement =>
    <Svg size={size} sw={1.7} color={color}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Svg>;
export const ListIcon = ({ size = 14, color = 'var(--ink3)' }: { size?: number; color?: string }): React.ReactElement =>
    <Svg size={size} sw={1.8} color={color} round><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Svg>;
export const ChevronIcon = ({ open }: { open: boolean }): React.ReactElement => (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform .2s', display: 'block' }}><polyline points="6 9 12 15 18 9" /></svg>
);
export const CaretDown = (): React.ReactElement => <Svg size={11} sw={2}><polyline points="6 9 12 15 18 9" /></Svg>;
export const ArrowOutIcon = (): React.ReactElement => <Svg size={11} sw={2}><path d="M7 17 17 7" /><polyline points="8 7 17 7 17 16" /></Svg>;
export const TickIcon = ({ size = 13, sw = 2.4, color = 'currentColor' }: { size?: number; sw?: number; color?: string }): React.ReactElement =>
    <Svg size={size} sw={sw} color={color}><polyline points="20 6 9 17 4 12" /></Svg>;
export const AttachIcon = (): React.ReactElement => <Svg size={15}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>;
export const SendIcon = (): React.ReactElement => <Svg size={15} sw={2}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></Svg>;
export const ThumbUpIcon = (): React.ReactElement => <Svg size={13}><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" /></Svg>;
export const ThumbDownIcon = (): React.ReactElement => <Svg size={13}><path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" /></Svg>;
export const RevertIcon = (): React.ReactElement => <Svg size={15} sw={1.8}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></Svg>;
export const ContinueIcon = (): React.ReactElement => <Svg size={15} sw={1.8}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Svg>;
export const SparkleIcon = (): React.ReactElement => <Svg size={13} sw={1.9} color="var(--acc)"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></Svg>;
export const StackIcon = (): React.ReactElement => <Svg size={13} sw={1.8}><rect x="3" y="3" width="11" height="11" rx="2" /><path d="M10 21h9a2 2 0 0 0 2-2v-9" /></Svg>;
export const OneDot = (): React.ReactElement => <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block', margin: '0 3px' }} />;
export const Spinner = (): React.ReactElement => <span className="sk-spin" />;
export const WaitDot = (): React.ReactElement => <span className="sk-wait-dot" />;

export type ChatModeIconName = 'agent' | 'plan' | 'ask';
export const ModeIcon = ({ mode }: { mode: ChatModeIconName }): React.ReactElement => {
    switch (mode) {
        case 'agent': return <Svg size={13} sw={1.8}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>;
        case 'plan': return <ListIcon size={13} color="currentColor" />;
        case 'ask': return <Svg size={13} sw={1.8}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>;
    }
};

const STEP_PATHS: Record<StepKind, React.ReactNode> = {
    think: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    read: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    shell: <><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>,
    check: <><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /><polyline points="9 12 11 14 15 10" /></>,
    review: <><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></>,
};

export const StepIcon = ({ kind, color = 'var(--ink3)' }: { kind: StepKind; color?: string }): React.ReactElement =>
    <Svg size={13} sw={1.8} color={color} round>{STEP_PATHS[kind]}</Svg>;
