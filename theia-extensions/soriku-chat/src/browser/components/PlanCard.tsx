/********************************************************************************
 * Soriku IDE — plan card (v2 l.931-959)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { ArrowOutIcon, ChevronIcon, ListIcon, Spinner, TickIcon } from './chat-icons';

export interface PlanTodoView {
    id: string;
    goal: string;
    done: boolean;
    active: boolean;
}

export interface PlanApproveView {
    /** e.g. "Runs locally · est. €0.00", only the parts the engine actually reported. */
    costLabel: string;
    resolving: boolean;
    onReview: () => void;
    onApprove: () => void;
}

export interface PlanCardProps {
    todos: PlanTodoView[];
    open: boolean;
    onToggle: () => void;
    onOpenPlan: () => void;
    approve?: PlanApproveView;
}

export function PlanCard(p: PlanCardProps): React.ReactElement {
    const done = p.todos.filter(t => t.done).length;
    const pct = p.todos.length === 0 ? 0 : (done / p.todos.length) * 100;
    return (
        <div className="sk-plan">
            <div className="sk-plan-head" onClick={p.onToggle}>
                <ListIcon />
                <span className="sk-plan-name">Plan</span>
                <span className="sk-plan-prog">{done} of {p.todos.length} done</span>
                <div className="sk-flex" />
                <button className="sk-plan-open" title="Open full plan"
                    onClick={e => { e.stopPropagation(); p.onOpenPlan(); }}>Open plan<ArrowOutIcon /></button>
                <span className={`sk-bar${done === p.todos.length && done > 0 ? ' sk-bar-done' : ''}`}><span style={{ width: `${pct}%` }} /></span>
                <span style={{ display: 'flex', color: 'var(--ink3)' }}><ChevronIcon open={p.open} /></span>
            </div>
            {p.open && <div className="sk-plan-body">
                {p.todos.map(t => (
                    <div key={t.id} className={`sk-todo${t.done ? ' sk-todo-done' : ''}${t.active ? ' sk-todo-active' : ''}`}>
                        <span className="sk-todo-ico">
                            {t.done ? <TickIcon size={14} color="var(--ok)" /> : t.active ? <Spinner /> : <span className="sk-todo-dot" />}
                        </span>
                        <span className="sk-todo-text">{t.goal}</span>
                    </div>
                ))}
            </div>}
            {p.approve && <div className="sk-plan-foot">
                <span className="sk-plan-cost">{p.approve.costLabel}</span>
                <button className="sk-btn sk-btn-lg" disabled={p.approve.resolving} onClick={p.approve.onReview}>Review full plan</button>
                <button className="sk-btn sk-btn-primary sk-btn-lg" disabled={p.approve.resolving} onClick={p.approve.onApprove}>
                    {p.approve.resolving ? 'Starting…' : 'Approve & run'}
                </button>
            </div>}
        </div>
    );
}
