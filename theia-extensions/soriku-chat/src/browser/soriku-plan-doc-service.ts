/********************************************************************************
 * Soriku IDE — plan document: shared view-model between the chat and the plan tab
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { Emitter, Event } from '@theia/core/lib/common';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { inject, injectable } from '@theia/core/shared/inversify';

export interface PlanDocTodo {
    id: string;
    goal: string;
    role?: string;
    model?: string;
    done: boolean;
    active: boolean;
}

export type PlanDocState = 'review' | 'running' | 'paused' | 'done' | 'failed';

/** Everything the plan tab shows, plus the actions it can trigger (bound to the chat's own plan flow). */
export interface PlanDocView {
    planId: string;
    title: string;
    slug: string;
    meta: string;
    /** The engine's markdown plan document (Context / Approach / Files / Steps / Verification), if it wrote one. */
    document?: string;
    todos: PlanDocTodo[];
    state: PlanDocState;
    resolving: boolean;
    onEditGoal: (taskId: string, goal: string) => void;
    onApprove: () => void;
    onCancel: () => void;
}

export const PLAN_DOC_WIDGET_ID = 'soriku-plan-doc';

@injectable()
export class SorikuPlanDocService {

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected current: PlanDocView | undefined;
    protected readonly onDidChangeEmitter = new Emitter<PlanDocView | undefined>();
    readonly onDidChange: Event<PlanDocView | undefined> = this.onDidChangeEmitter.event;

    get(): PlanDocView | undefined {
        return this.current;
    }

    set(view: PlanDocView | undefined): void {
        this.current = view;
        this.onDidChangeEmitter.fire(view);
    }

    /** Opens (or focuses) the plan tab in the editor area. */
    async open(): Promise<void> {
        const widget = await this.widgets.getOrCreateWidget(PLAN_DOC_WIDGET_ID);
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main', mode: 'tab-before' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
