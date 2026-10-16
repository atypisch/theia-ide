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
    it('revert & restart: stop, undo, resend', () => {
        assert.deepEqual(editActions('revert', ' new ', { running: true, hasChanges: true }), [
            { kind: 'stop_run' }, { kind: 'undo_checkpoint' }, { kind: 'send', text: 'new', mode: 'restart' },
        ]);
    });
    it('revert on a finished run only undoes and resends', () => {
        assert.deepEqual(editActions('revert', 'x', { running: false, hasChanges: true }), [
            { kind: 'undo_checkpoint' }, { kind: 'send', text: 'x', mode: 'restart' },
        ]);
    });
    it('revert with nothing changed skips the undo', () => {
        assert.deepEqual(editActions('revert', 'x', { running: true, hasChanges: false }), [
            { kind: 'stop_run' }, { kind: 'send', text: 'x', mode: 'restart' },
        ]);
    });
    it('continue stops live work and sends an amend turn that keeps the files', () => {
        const live = editActions('continue', 'x', { running: true, hasChanges: true });
        assert.deepEqual(live.map(a => a.kind), ['stop_run', 'send']);
        const done = editActions('continue', 'x', { running: false, hasChanges: true });
        assert.deepEqual(done.map(a => a.kind), ['send']);
        const send = done[0] as { text: string; mode: string };
        assert.equal(send.mode, 'amend');
        assert.match(send.text, /Keep the work already done/);
        assert.match(send.text, /x$/);
    });
    it('never undoes files on continue', () => {
        assert.ok(!editActions('continue', 'x', { running: true, hasChanges: true }).some(a => a.kind === 'undo_checkpoint'));
    });
    it('an empty edit does nothing', () => {
        assert.deepEqual(editActions('revert', '   ', { running: true, hasChanges: true }), []);
    });
});
