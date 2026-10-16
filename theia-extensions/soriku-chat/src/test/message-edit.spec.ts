/********************************************************************************
 * Soriku IDE — message-edit spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editActions, needsDecision } from '../common/message-edit';

describe('message edit decisions', () => {
    it('only asks when agents already worked or the run is live', () => {
        assert.equal(needsDecision({ running: false, hasChanges: false }), false);
        assert.equal(needsDecision({ running: true, hasChanges: false }), true);
        assert.equal(needsDecision({ running: false, hasChanges: true }), true);
    });
    it('revert & restart: pause, undo, cancel, resend', () => {
        assert.deepEqual(editActions('revert', ' new ', { running: true, hasChanges: true, planId: 'p1' }), [
            { kind: 'pause_run' }, { kind: 'undo_checkpoint' }, { kind: 'cancel_plan' }, { kind: 'send', text: 'new', mode: 'restart' },
        ]);
    });
    it('revert on a finished run with no plan just undoes and resends', () => {
        assert.deepEqual(editActions('revert', 'x', { running: false, hasChanges: true }), [
            { kind: 'undo_checkpoint' }, { kind: 'send', text: 'x', mode: 'restart' },
        ]);
    });
    it('continue on a live plan updates it and resumes', () => {
        assert.deepEqual(editActions('continue', 'x', { running: true, hasChanges: true, planId: 'p1' }), [
            { kind: 'update_plan', text: 'x' }, { kind: 'resume_run' },
        ]);
    });
    it('continue on a finished run sends an amend turn that keeps the work', () => {
        const [a] = editActions('continue', 'x', { running: false, hasChanges: true });
        assert.equal(a.kind, 'send');
        assert.match((a as { text: string }).text, /Keep the work already done/);
        assert.match((a as { text: string }).text, /x$/);
    });
    it('an empty edit does nothing', () => {
        assert.deepEqual(editActions('revert', '   ', { running: true, hasChanges: true }), []);
    });
});
