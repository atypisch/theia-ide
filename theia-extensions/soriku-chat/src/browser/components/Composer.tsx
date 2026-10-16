/********************************************************************************
 * Soriku IDE — composer: textarea, Mode + Model pills and popovers (v2 l.1142-1201)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import {
    ChatModeChoice, MAX_MULTIPLE_MODELS, ModelSelection, RoutingChoice,
} from '../../common/mode-model';
import { AttachIcon, CaretDown, ModeIcon, OneDot, SendIcon, SparkleIcon, StackIcon, TickIcon } from './chat-icons';

export interface ModelRow {
    id: string;
    local: boolean;
    ok: boolean;
    /** Right-aligned tag: the unavailability reason, else local/cloud. */
    tag: string;
}

export interface AttachmentView {
    id: string;
    src: string;
    name?: string;
}

export interface ComposerProps {
    inputRef: React.RefObject<HTMLTextAreaElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    placeholder: string;
    hasText: boolean;
    sending: boolean;
    attachments: AttachmentView[];
    onRemoveAttachment: (id: string) => void;
    onAttachClick: () => void;
    onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onInput: () => void;
    onSend: () => void;
    mode: ChatModeChoice;
    onMode: (m: ChatModeChoice) => void;
    model: ModelSelection;
    onModelTab: (kind: ModelSelection['kind']) => void;
    onRouting: (r: RoutingChoice) => void;
    onPickModel: (id: string) => void;
    models: ModelRow[];
    popMenu: 'mode' | 'model' | undefined;
    onPop: (m: 'mode' | 'model' | undefined) => void;
    onManageModels: () => void;
}

const MODES: Array<[ChatModeChoice, string, string]> = [
    ['agent', 'Agent', 'Writes code and runs tools'],
    ['plan', 'Plan', 'Proposes a plan, you approve first'],
    ['ask', 'Ask', 'Answers only — never changes files'],
];

const ROUTES: Array<[RoutingChoice, string, string]> = [
    ['local_first', 'Local-first', 'Warm local model when it clears the bar'],
    ['hybrid', 'Hybrid', 'Local for code, cloud for hard reasoning'],
    ['best', 'Best quality', 'Strongest model — cost cap applies'],
];

const TABS: Array<[ModelSelection['kind'], string]> = [['auto', 'Auto'], ['single', 'Single'], ['multiple', 'Multiple']];

function modelHint(m: ModelSelection): string {
    if (m.kind === 'auto') { return 'Soriku picks the best model for every step from your capability map.'; }
    if (m.kind === 'single') { return 'Every step uses this one model.'; }
    return `${m.modelIds.length} of ${MAX_MULTIPLE_MODELS} selected — each answers, you compare or merge.`;
}

function pillLabel(m: ModelSelection): string {
    if (m.kind === 'auto') { return 'Auto'; }
    if (m.kind === 'single') { return m.modelId ?? 'Pick a model'; }
    return `${m.modelIds.length} models`;
}

const Radio = ({ on }: { on: boolean }): React.ReactElement => <span className={`sk-radio${on ? ' on' : ''}`} />;
const Cbox = ({ on }: { on: boolean }): React.ReactElement => (
    <span className={`sk-cbox${on ? ' on' : ''}`}>{on && <TickIcon size={9} sw={3.4} color="var(--on-acc)" />}</span>
);

function ModelList({ p }: { p: ComposerProps }): React.ReactElement {
    const multi = p.model.kind === 'multiple';
    const isOn = (id: string): boolean => p.model.kind === 'multiple' ? p.model.modelIds.includes(id) : p.model.kind === 'single' && p.model.modelId === id;
    const row = (m: ModelRow): React.ReactElement => {
        const on = isOn(m.id);
        // A model that is not ticked and would exceed the cap behaves like an unavailable one.
        const capped = multi && !on && p.model.kind === 'multiple' && p.model.modelIds.length >= MAX_MULTIPLE_MODELS;
        const disabled = !m.ok || capped;
        return (
            <div key={m.id} className={`sk-model-row${on ? ' on' : ''}${disabled ? ' off' : ''}`} title={m.ok ? m.id : `${m.id} — ${m.tag}`}
                onClick={disabled ? undefined : () => p.onPickModel(m.id)}>
                {multi ? <Cbox on={on} /> : <Radio on={on} />}
                <span className="sk-model-id">{m.id}</span>
                <span className="sk-model-tag">{m.tag}</span>
            </div>
        );
    };
    const local = p.models.filter(m => m.local);
    const cloud = p.models.filter(m => !m.local);
    return <>
        <div className="sk-eyebrow sk-group-label">Local</div>
        {local.length === 0 ? <div className="sk-hist-empty">No local models installed.</div> : local.map(row)}
        {cloud.length > 0 && <>
            <div className="sk-eyebrow sk-group-label gap">Cloud · opt-in, capped</div>
            {cloud.map(row)}
        </>}
    </>;
}

export function Composer(p: ComposerProps): React.ReactElement {
    const mode = MODES.find(m => m[0] === p.mode) ?? MODES[1];
    const canSend = p.hasText && !p.sending;
    const close = (): void => p.onPop(undefined);
    return (
        <div className="sk-composer">
            {p.attachments.length > 0 && <div className="sk-attachments">
                {p.attachments.map(a => (
                    <div key={a.id} className="sk-attachment">
                        <img src={a.src} alt={a.name ?? 'attached image'} />
                        <button title="Remove image" disabled={p.sending} onClick={() => p.onRemoveAttachment(a.id)}>×</button>
                    </div>
                ))}
            </div>}
            <textarea ref={p.inputRef} rows={1} className="sk-scroll" placeholder={p.placeholder} onPaste={p.onPaste} onInput={p.onInput}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSend(); }
                }} />
            <div className="sk-composer-bar">
                <button className="sk-pill" title="Mode" onClick={() => p.onPop(p.popMenu === 'mode' ? undefined : 'mode')}>
                    <span style={{ display: 'flex' }}><ModeIcon mode={p.mode} /></span>{mode[1]}<span className="sk-pill-caret"><CaretDown /></span>
                </button>
                <button className="sk-pill" title="Model" onClick={() => p.onPop(p.popMenu === 'model' ? undefined : 'model')}>
                    <span style={{ display: 'flex' }}>
                        {p.model.kind === 'auto' ? <SparkleIcon /> : p.model.kind === 'multiple' ? <StackIcon /> : <OneDot />}
                    </span>
                    <span className="sk-pill-mono">{pillLabel(p.model)}</span><span className="sk-pill-caret"><CaretDown /></span>
                </button>
                <div className="sk-flex" />
                <input ref={p.fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple style={{ display: 'none' }} onChange={p.onFileInput} />
                <button className="sk-attach" title="Attach an image" onClick={p.onAttachClick}><AttachIcon /></button>
                <button className={`sk-send${canSend ? ' ready' : ''}`} title="Send" onClick={canSend ? p.onSend : undefined}><SendIcon /></button>
            </div>

            {p.popMenu === 'mode' && <>
                <div className="sk-popover-backdrop" style={{ zIndex: 45 }} onClick={close} />
                <div className="sk-popover sk-pop-mode">
                    {MODES.map(([k, label, desc]) => (
                        <div key={k} className="sk-opt" onClick={() => { p.onMode(k); close(); }}>
                            <span className="sk-opt-ico"><ModeIcon mode={k} /></span>
                            <div className="sk-flex"><div className="sk-opt-label">{label}</div><div className="sk-opt-desc">{desc}</div></div>
                            <span className="sk-opt-check">{p.mode === k && <TickIcon color="var(--acc)" />}</span>
                        </div>
                    ))}
                </div>
            </>}

            {p.popMenu === 'model' && <>
                <div className="sk-popover-backdrop" style={{ zIndex: 45 }} onClick={close} />
                <div className="sk-popover sk-pop-model">
                    <div className="sk-tabs">
                        {TABS.map(([k, label]) => (
                            <button key={k} className={`sk-tab${p.model.kind === k ? ' on' : ''}`} onClick={() => p.onModelTab(k)}>{label}</button>
                        ))}
                    </div>
                    <div className="sk-model-hint">{modelHint(p.model)}</div>
                    {p.model.kind === 'auto'
                        ? ROUTES.map(([k, label, desc]) => {
                            const on = p.model.kind === 'auto' && p.model.routing === k;
                            return (
                                <div key={k} className={`sk-opt${on ? ' on' : ''}`} onClick={() => p.onRouting(k)}>
                                    <span className="sk-opt-ico" style={{ marginTop: 1 }}><Radio on={on} /></span>
                                    <div className="sk-flex">
                                        <div className="sk-opt-label" style={{ fontWeight: 400 }}>{label}</div>
                                        <div className="sk-opt-desc" style={{ fontSize: 11 }}>{desc}</div>
                                    </div>
                                </div>
                            );
                        })
                        : <ModelList p={p} />}
                    <button className="sk-pop-link" style={{ marginTop: 6 }} onClick={() => { close(); p.onManageModels(); }}>Manage models →</button>
                </div>
            </>}
        </div>
    );
}
