/********************************************************************************
 * Soriku IDE — plan tab (v2 l.372-472): the plan as a document next to the code
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatMarkdown } from './chat-markdown-view';
import { PLAN_DOC_WIDGET_ID, PlanDocState, SorikuPlanDocService } from './soriku-plan-doc-service';
import { ListIcon, Spinner, TickIcon } from './components/chat-icons';

const CHIP: Record<PlanDocState, { label: string; cls: string }> = {
    review: { label: 'Plan ready', cls: '' },
    running: { label: 'Running', cls: 'sk-chip-running' },
    paused: { label: 'Paused', cls: 'sk-chip-paused' },
    done: { label: 'Done', cls: 'sk-chip-done' },
    failed: { label: 'Failed', cls: 'sk-chip-failed' },
};

@injectable()
export class SorikuPlanDocWidget extends ReactWidget {

    static readonly ID = PLAN_DOC_WIDGET_ID;

    @inject(SorikuPlanDocService)
    protected readonly planDoc: SorikuPlanDocService;

    @postConstruct()
    protected init(): void {
        this.id = SorikuPlanDocWidget.ID;
        this.title.label = 'plan.md';
        this.title.caption = 'Plan';
        this.title.iconClass = 'codicon codicon-checklist';
        this.title.closable = true;
        this.addClass('soriku-plan-doc-widget');
        this.toDispose.push(this.planDoc.onDidChange(() => this.update()));
        this.update();
    }

    protected render(): React.ReactNode {
        const view = this.planDoc.get();
        if (!view) {
            return <div className="sk-plandoc"><div className="sk-plandoc-empty">No plan yet. Ask in Plan mode and the plan appears here.</div></div>;
        }
        const done = view.todos.filter(t => t.done).length;
        const pct = view.todos.length === 0 ? 0 : (done / view.todos.length) * 100;
        const chip = CHIP[view.state];
        return <div className="sk-plandoc">
            <div className="sk-plandoc-head">
                <span className="sk-plandoc-path">.soriku › plans › {view.slug}.md</span>
                <span className={`sk-chip ${chip.cls}`}>{chip.label}</span>
                <div className="sk-flex" />
                <span className="sk-plan-prog">{done} of {view.todos.length} done</span>
                <span className={`sk-bar${done === view.todos.length && done > 0 ? ' sk-bar-done' : ''}`} style={{ width: 72 }}><span style={{ width: `${pct}%` }} /></span>
                {view.state === 'review' && <>
                    <button className="sk-btn sk-btn-lg" disabled={view.resolving} onClick={view.onCancel}>Cancel</button>
                    <button className="sk-btn sk-btn-primary sk-btn-lg" disabled={view.resolving} onClick={view.onApprove}>
                        {view.resolving ? 'Starting…' : 'Approve & run'}
                    </button>
                </>}
            </div>
            <div className="sk-plandoc-scroll sk-scroll">
                <div className="sk-plandoc-body">
                    <div className="sk-eyebrow">Plan</div>
                    <h1 className="sk-plandoc-title">{view.title}</h1>
                    <div className="sk-plandoc-meta">{view.meta}</div>
                    {view.document && <div className="sk-plandoc-md"><ChatMarkdown text={view.document} /></div>}
                    <div className="sk-eyebrow" style={{ marginTop: 28 }}>To-dos</div>
                    {view.todos.map((t, i) => (
                        <div key={t.id} className={`sk-plandoc-card${t.active ? ' active' : ''}`}>
                            <div className="sk-plandoc-card-head">
                                <span className="sk-plandoc-num">{i + 1}</span>
                                {view.state === 'review'
                                    ? <textarea className="sk-plandoc-goal" rows={2} disabled={view.resolving} value={t.goal}
                                        onChange={e => view.onEditGoal(t.id, e.target.value)} />
                                    : <span className={`sk-plandoc-goal-text${t.done ? ' done' : ''}`}>{t.goal}</span>}
                                <span className="sk-plandoc-state">
                                    {t.done ? <TickIcon size={14} color="var(--ok)" /> : t.active ? <Spinner /> : <ListIcon size={13} />}
                                </span>
                            </div>
                            {(t.role || t.model) && <div className="sk-plandoc-card-meta">{[t.role, t.model].filter(Boolean).join(' · ')}</div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>;
    }
}
