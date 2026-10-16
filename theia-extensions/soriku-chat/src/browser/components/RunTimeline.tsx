/********************************************************************************
 * Soriku IDE — run timeline: step rows, inline body, inline approval (v2 l.960-996)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { RunStep } from '../../common/run-timeline';
import { signed } from '../../common/chat-format';
import { Spinner, StepIcon, WaitDot } from './chat-icons';

export interface StepDetail {
    /** Expandable text: shell output, written content preview. */
    body?: string;
    /** Opens the changed file (edit steps). */
    openPath?: string;
}

export interface ApprovalView {
    /** The step this approval belongs to; when undefined it renders after the last step. */
    stepId?: string;
    command: string;
    /** Prefix glyph: `$` for shell, empty for other tools. */
    prompt: string;
    askText: string;
    onSkip: () => void;
    onAlways: () => void;
    onRun: () => void;
}

export interface RunTimelineProps {
    steps: RunStep[];
    details: Record<string, StepDetail>;
    expanded: string | undefined;
    onToggle: (id: string) => void;
    onOpenFile: (path: string) => void;
    approval?: ApprovalView;
}

function metaClass(step: RunStep): string {
    if (step.status === 'active' || step.status === 'waiting' || !step.result) { return ''; }
    return step.tone === 'danger' ? ' sk-step-meta-danger' : step.tone === 'warn' ? ' sk-step-meta-warn' : ' sk-step-meta-ok';
}

function ApprovalCard({ a }: { a: ApprovalView }): React.ReactElement {
    return (
        <div className="sk-approve">
            <div className="sk-approve-cmd">{a.prompt && <><b>{a.prompt}</b> </>}{a.command}</div>
            <div className="sk-approve-foot">
                <span className="sk-approve-ask">{a.askText}</span>
                <button className="sk-btn sk-btn-ghost" onClick={a.onSkip}>Skip</button>
                <button className="sk-btn" onClick={a.onAlways}>Always allow</button>
                <button className="sk-btn sk-btn-primary" onClick={a.onRun}>Run</button>
            </div>
        </div>
    );
}

export function RunTimeline(p: RunTimelineProps): React.ReactElement {
    const attached = p.approval?.stepId !== undefined && p.steps.some(s => s.id === p.approval?.stepId);
    return (
        <div className="sk-steps">
            {p.steps.map(s => {
                const detail = p.details[s.id];
                const canOpen = !!detail?.body && s.status !== 'waiting';
                const isOpen = canOpen && p.expanded === s.id;
                const active = s.status === 'active' || s.status === 'waiting';
                const verb = s.status === 'waiting' ? 'Run' : active ? s.verbActive : s.verbDone;
                const showStats = !active && (s.add !== undefined || s.del !== undefined);
                const meta = !active && s.result ? s.result : active ? s.agent : undefined;
                return (
                    <div key={s.id} className={`sk-step${active ? ' sk-step-active' : ''}`}>
                        <div className={`sk-step-row${canOpen ? ' can-open' : ''}${isOpen ? ' open' : ''}`}
                            onClick={canOpen ? () => p.onToggle(s.id) : undefined}>
                            <span className="sk-step-ico">
                                {s.status === 'waiting' ? <WaitDot />
                                    : s.status === 'active' ? <Spinner />
                                        : <StepIcon kind={s.kind} color={s.tone === 'warn' ? 'var(--warn)' : s.tone === 'danger' ? 'var(--danger)' : undefined} />}
                            </span>
                            <span className="sk-step-verb">{verb}</span>
                            {s.target && <span className="sk-step-target" title={s.target}>{s.target}</span>}
                            <span className="sk-flex" />
                            {showStats && <span className="sk-step-stats">
                                <span className="sk-add">{signed(s.add ?? 0, '+')}</span>
                                <span className="sk-del">{signed(s.del ?? 0, '−')}</span>
                            </span>}
                            {meta && <span className={`sk-step-meta${metaClass(s)}`}>{meta}</span>}
                        </div>
                        {isOpen && detail?.body && <div className="sk-step-body sk-scroll"><pre>{detail.body}</pre></div>}
                        {isOpen && detail?.openPath && <button className="sk-step-open-file" onClick={() => p.onOpenFile(detail.openPath!)}>Open file</button>}
                        {p.approval && p.approval.stepId === s.id && <ApprovalCard a={p.approval} />}
                    </div>
                );
            })}
            {p.approval && !attached && <ApprovalCard a={p.approval} />}
        </div>
    );
}
