/********************************************************************************
 * Soriku IDE — run summary, paused banner, past banner, run bar (v2 l.1000-1050, 1134-1141)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { signed } from '../../common/chat-format';
import { DocIcon, ThumbDownIcon, ThumbUpIcon, TickIcon } from './chat-icons';

export interface SummaryFile {
    path: string;
    name: string;
    add?: number;
    del?: number;
}

export interface RunSummaryProps {
    title: string;
    /** Amber tick instead of green (verify failed). */
    warn: boolean;
    time: string;
    stats: string[];
    files: SummaryFile[];
    onOpenFile: (path: string) => void;
    vote: 'positive' | 'negative' | undefined;
    onVote: (v: 'positive' | 'negative') => void;
    /** undefined = no checkpoint to act on (no agent write was recorded). */
    checkpoint?: { kept: boolean; undone: boolean; onUndo: () => void; onKeep: () => void; onRestore: () => void };
}

export function RunSummary(p: RunSummaryProps): React.ReactElement {
    const cp = p.checkpoint;
    return (
        <div className="sk-summary">
            <div className="sk-summary-main">
                <div className="sk-summary-head">
                    <span className={`sk-summary-tick${p.warn ? ' sk-summary-tick-warn' : ''}`}><TickIcon size={11} sw={3} /></span>
                    <span className="sk-summary-title">{p.title}</span>
                    <div className="sk-flex" />
                    {p.time && <span className="sk-summary-time">{p.time}</span>}
                </div>
                {p.stats.length > 0 && <div className="sk-summary-stats">{p.stats.map(s => <span key={s}>{s}</span>)}</div>}
            </div>
            {p.files.length > 0 && <div className="sk-files">
                {p.files.map(f => (
                    <div key={f.path} className="sk-file-row" title={f.path} onClick={() => p.onOpenFile(f.path)}>
                        <DocIcon color="var(--ink3)" />
                        <span className="sk-file-name">{f.name}</span>
                        <span className="sk-file-stats">
                            {f.add !== undefined && <span className="sk-add">{signed(f.add, '+')}</span>}
                            {f.del !== undefined && <span className="sk-del">{signed(f.del, '−')}</span>}
                        </span>
                    </div>
                ))}
            </div>}
            <div className="sk-summary-foot">
                {cp?.undone && <>
                    <span className="sk-kept">Changes undone · files restored</span>
                    <div className="sk-flex" />
                    <button className="sk-btn sk-btn-ghost" onClick={cp.onKeep}>Keep anyway</button>
                </>}
                {!cp?.kept && !cp?.undone && <>
                    <button className={`sk-vote${p.vote === 'positive' ? ' on' : ''}`} title="Good response" onClick={() => p.onVote('positive')}><ThumbUpIcon /></button>
                    <button className={`sk-vote${p.vote === 'negative' ? ' on' : ''}`} title="Bad response" onClick={() => p.onVote('negative')}><ThumbDownIcon /></button>
                    <div className="sk-flex" />
                    {cp && <>
                        <button className="sk-btn sk-btn-lg" onClick={cp.onUndo}>Undo all</button>
                        <button className="sk-btn sk-btn-primary sk-btn-lg" onClick={cp.onKeep}>Keep changes</button>
                    </>}
                </>}
                {cp?.kept && <>
                    <span className="sk-kept-tick"><TickIcon /></span>
                    <span className="sk-kept">Kept · checkpoint saved to history</span>
                    <div className="sk-flex" />
                    <button className="sk-btn sk-btn-ghost" onClick={cp.onRestore}>Restore checkpoint</button>
                </>}
            </div>
        </div>
    );
}

export function PausedBanner({ onResume }: { onResume: () => void }): React.ReactElement {
    return (
        <div className="sk-paused">
            <span className="sk-paused-dot" />
            <span className="sk-flex">Run paused — nothing else will change until you resume.</span>
            <button className="sk-btn" onClick={onResume}>Resume</button>
        </div>
    );
}

export function PastBanner({ when, onBack }: { when: string; onBack: () => void }): React.ReactElement {
    return (
        <div className="sk-past">
            <DocIcon size={13} color="var(--ink3)" />
            <span>Past session{when ? ` · ${when}` : ''}</span>
            <button className="sk-btn" onClick={onBack}>Back to current run</button>
        </div>
    );
}

export interface RunBarProps {
    waiting: boolean;
    text: string;
    count: string;
    onStop: () => void;
    stopLabel: string;
}

export function RunBar(p: RunBarProps): React.ReactElement {
    return (
        <div className="sk-runbar">
            <span className="sk-runbar-ico">{p.waiting ? <span className="sk-wait-dot" /> : <span className="sk-spin" />}</span>
            <span className="sk-runbar-text">{p.text}</span>
            {p.count && <span className="sk-runbar-count">{p.count}</span>}
            <button className="sk-btn" onClick={p.onStop}>{p.stopLabel}</button>
        </div>
    );
}
