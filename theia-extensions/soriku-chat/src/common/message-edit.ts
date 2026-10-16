/********************************************************************************
 * Soriku IDE — message editing: what each v2 choice does (pure)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * v2: editing the root user message while/after agents worked asks the user
 * to choose. The decision is turned into an ordered list of steps the widget
 * executes — kept pure so the rules are testable without a running engine.
 */
export type EditChoice = 'revert' | 'continue';

export type EditAction =
    | { kind: 'pause_run' }
    | { kind: 'undo_checkpoint' }
    | { kind: 'cancel_plan' }
    | { kind: 'resume_run' }
    | { kind: 'update_plan'; text: string }
    | { kind: 'send'; text: string; mode: 'restart' | 'amend' };

export interface EditContext {
    /** Run is still executing (not finished). */
    running: boolean;
    /** Agents already changed files. */
    hasChanges: boolean;
    /** The plan id when the engine plan is still parked or running. */
    planId?: string;
}

/** Whether saving needs the revert/continue decision card (v2: only when agents already worked). */
export function needsDecision(ctx: EditContext): boolean {
    return ctx.hasChanges || ctx.running;
}

export function editActions(choice: EditChoice, newText: string, ctx: EditContext): EditAction[] {
    const text = newText.trim();
    if (!text) { return []; }
    const actions: EditAction[] = [];
    if (choice === 'revert') {
        if (ctx.running) { actions.push({ kind: 'pause_run' }); }
        if (ctx.hasChanges) { actions.push({ kind: 'undo_checkpoint' }); }
        if (ctx.planId) { actions.push({ kind: 'cancel_plan' }); }
        actions.push({ kind: 'send', text, mode: 'restart' });
    } else if (ctx.planId && ctx.running) {
        // continue: keep what is written; agents adapt the remaining to-dos
        actions.push({ kind: 'update_plan', text }, { kind: 'resume_run' });
    } else {
        const amend = `The user edited their instruction. Keep the work already done and adapt the remaining steps.\n\nUpdated instruction:\n${text}`;
        actions.push({ kind: 'send', text: amend, mode: 'amend' });
    }
    return actions;
}
