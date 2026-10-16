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
    /** Stop the running work (pause/stop the plan or abort the stream). */
    | { kind: 'stop_run' }
    | { kind: 'undo_checkpoint' }
    /** `restart` replaces the old turn; `amend` keeps it and adds a follow-up turn. */
    | { kind: 'send'; text: string; mode: 'restart' | 'amend' };

export interface EditContext {
    /** Run is still executing (not finished). */
    running: boolean;
    /** Agents already changed files. */
    hasChanges: boolean;
}

/** Whether saving needs the revert/continue decision card (v2: only when agents already worked). */
export function needsDecision(ctx: EditContext): boolean {
    return ctx.hasChanges || ctx.running;
}

const AMEND_PREFIX = 'The user edited their instruction. Keep the work already done and adapt the remaining steps.';

/**
 * Revert & restart: stop, put the files back, run the edited message from scratch.
 * Continue from here: stop, keep every file as written, and send a follow-up turn
 * that tells the agents to adapt. (The engine cannot rewrite a running plan, so
 * "continue" is a new turn on top of the finished work — not a silent plan patch.)
 */
export function editActions(choice: EditChoice, newText: string, ctx: EditContext): EditAction[] {
    const text = newText.trim();
    if (!text) { return []; }
    const actions: EditAction[] = [];
    if (ctx.running) { actions.push({ kind: 'stop_run' }); }
    if (choice === 'revert') {
        if (ctx.hasChanges) { actions.push({ kind: 'undo_checkpoint' }); }
        actions.push({ kind: 'send', text, mode: 'restart' });
    } else {
        actions.push({ kind: 'send', text: `${AMEND_PREFIX}\n\nUpdated instruction:\n${text}`, mode: 'amend' });
    }
    return actions;
}
