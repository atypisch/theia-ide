/********************************************************************************
 * Soriku IDE — user message bubble: edit + revert-or-continue decision (v2 l.875-924, 1100-1112)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { UserMessage } from '../../common/chat-model';
import { ContinueIcon, DocIcon, PenIcon, RevertIcon } from './chat-icons';

export interface DecisionView {
    sub: string;
    revertDesc: string;
    onRevert: () => void;
    onContinue: () => void;
    onDiscard: () => void;
}

export interface UserBubbleProps {
    message: UserMessage;
    time: string;
    edited: boolean;
    editing: boolean;
    draft: string;
    editHint: string;
    canEdit: boolean;
    /** Shown with an accent border while the revert/continue choice is pending. */
    pending?: boolean;
    decision?: DecisionView;
    onStartEdit: () => void;
    onDraft: (value: string) => void;
    onCancel: () => void;
    onSave: () => void;
}

export function UserBubble(p: UserBubbleProps): React.ReactElement {
    const m = p.message;
    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); p.onSave(); }
        if (e.key === 'Escape') { e.preventDefault(); p.onCancel(); }
    };
    return (
        <div className="sk-user">
            {p.editing
                ? <div className="sk-editbox">
                    <textarea autoFocus rows={3} className="sk-scroll" value={p.draft} onChange={e => p.onDraft(e.target.value)} onKeyDown={onKey} />
                    <div className="sk-editbox-foot">
                        <span className="sk-editbox-hint">{p.editHint}</span>
                        <button className="sk-btn" onClick={p.onCancel}>Cancel</button>
                        <button className="sk-btn sk-btn-primary" onClick={p.onSave}>Save</button>
                    </div>
                </div>
                : <>
                    <div className={`sk-bubble${p.pending ? ' sk-bubble-pending' : ''}`}>
                        {m.images && m.images.length > 0 && <div className="sk-bubble-images">
                            {m.images.map((img, i) => <img key={i} src={`data:${img.mimeType};base64,${img.base64}`} alt="attached" />)}
                        </div>}
                        <span>{m.text}</span>
                        {m.fileMentions && m.fileMentions.length > 0 && <div className="sk-chips">
                            {m.fileMentions.map(f => <span key={f} className="sk-file-chip"><DocIcon size={10} />{f}</span>)}
                        </div>}
                    </div>
                    <div className="sk-meta">
                        {p.edited && <span className="sk-meta-edited">edited</span>}
                        {p.time && <span className="sk-meta-time">{p.time}</span>}
                        {p.canEdit && <button className="sk-edit-btn" title="Edit message" onClick={p.onStartEdit}><PenIcon />Edit</button>}
                    </div>
                </>}
            {p.decision && !p.editing && <div className="sk-decide">
                <div className="sk-decide-head">
                    <span className="sk-warn-dot" />
                    <div className="sk-flex">
                        <div className="sk-decide-title">Agents already worked on this message</div>
                        <div className="sk-decide-sub">{p.decision.sub}</div>
                    </div>
                </div>
                <div className="sk-decide-opts">
                    <div className="sk-decide-opt" onClick={p.decision.onRevert}>
                        <span className="sk-decide-opt-ico"><RevertIcon /></span>
                        <div className="sk-flex">
                            <div className="sk-decide-opt-title">Revert &amp; restart</div>
                            <div className="sk-decide-opt-desc">{p.decision.revertDesc}</div>
                        </div>
                    </div>
                    <div className="sk-decide-opt" onClick={p.decision.onContinue}>
                        <span className="sk-decide-opt-ico"><ContinueIcon /></span>
                        <div className="sk-flex">
                            <div className="sk-decide-opt-title">Continue from here</div>
                            <div className="sk-decide-opt-desc">Keep what&apos;s written. Agents adapt the remaining to-dos to your edit.</div>
                        </div>
                    </div>
                </div>
                <div className="sk-decide-foot">
                    <span>Run is paused until you choose.</span>
                    <button className="sk-btn sk-btn-ghost" onClick={p.decision.onDiscard}>Discard edit</button>
                </div>
            </div>}
        </div>
    );
}
