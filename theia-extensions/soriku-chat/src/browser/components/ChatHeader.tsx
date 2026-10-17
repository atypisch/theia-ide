/********************************************************************************
 * Soriku IDE — chat header + history popover (v2 l.843-869)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { BulbIcon, DockIcon, HistoryIcon, MaxIcon, PlusIcon, TabIcon } from './chat-icons';

export interface HistoryEntry {
    id: string;
    title: string;
    sub: string;
    time: string;
    on: boolean;
}

export interface ChatHeaderProps {
    title: string;
    chipLabel: string;
    chipClass: string;
    history: HistoryEntry[] | undefined;
    histOpen: boolean;
    onToggleHist: () => void;
    onOpenHistory: (id: string) => void;
    onAllConversations: () => void;
    onNew: () => void;
    newDisabled: boolean;
    placement: 'dock' | 'tab';
    onPlacement: () => void;
    maxed: boolean;
    onMax: () => void;
    onInsights?: () => void;
    /** Dragging the header offers a drop zone to move the chat between dock and tab. */
    onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd?: () => void;
}

export function ChatHeader(p: ChatHeaderProps): React.ReactElement {
    return (
        <div className="sk-chat-head" draggable={!!p.onDragStart} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}
            title={p.onDragStart ? 'Drag to move chat' : undefined}>
            <span className="sk-chat-title" title={p.title}>{p.title}</span>
            {p.chipLabel && <span className={`sk-chip ${p.chipClass}`}>{p.chipLabel}</span>}
            <div className="sk-flex" />
            <div className="sk-chat-head-actions">
                <button className="sk-icon-btn" title="History" onClick={p.onToggleHist}><HistoryIcon /></button>
                <button className="sk-icon-btn" title="New chat" disabled={p.newDisabled} onClick={p.onNew}><PlusIcon /></button>
                <button className="sk-icon-btn" title={p.placement === 'dock' ? 'Open chat as editor tab' : 'Move chat to side panel'}
                    onClick={p.onPlacement}>{p.placement === 'dock' ? <TabIcon /> : <DockIcon />}</button>
                <button className="sk-icon-btn" title={p.maxed ? 'Restore chat size' : 'Maximize chat'} onClick={p.onMax}><MaxIcon maxed={p.maxed} /></button>
                {p.onInsights && <button className="sk-icon-btn" title="What this agent has learned" onClick={p.onInsights}><BulbIcon /></button>}
            </div>
            {p.histOpen && <>
                <div className="sk-popover-backdrop" onClick={p.onToggleHist} />
                <div className="sk-popover sk-hist">
                    <div className="sk-eyebrow" style={{ padding: '8px 9px 6px' }}>Recent chats</div>
                    {p.history === undefined && <div className="sk-hist-empty">Loading…</div>}
                    {p.history !== undefined && p.history.length === 0 && <div className="sk-hist-empty">No earlier chats yet.</div>}
                    {p.history?.map(h => (
                        <div key={h.id} className={`sk-hist-item${h.on ? ' on' : ''}`} onClick={() => p.onOpenHistory(h.id)}>
                            <div className="sk-flex">
                                <div className="sk-hist-title">{h.title}</div>
                                <div className="sk-hist-preview">{h.sub}</div>
                            </div>
                            <span className="sk-hist-time">{h.time}</span>
                        </div>
                    ))}
                    <button className="sk-pop-link" onClick={p.onAllConversations}>All conversations →</button>
                </div>
            </>}
        </div>
    );
}
