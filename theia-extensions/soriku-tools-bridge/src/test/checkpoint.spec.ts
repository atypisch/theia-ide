/********************************************************************************
 * Soriku IDE — checkpoint spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    changedPaths, checkpointFileName, createCheckpoint, markKept, markUndone, parseCheckpoint, recordOriginal, serializeCheckpoint, undoActions,
} from '../common/checkpoint';

describe('checkpoint', () => {
    it('only the first record per path counts', () => {
        let cp = createCheckpoint('r1', new Date('2026-10-16T12:00:00Z'));
        cp = recordOriginal(cp, 'a.py', 'v1');
        cp = recordOriginal(cp, 'a.py', 'v2-agent-wrote-this');
        assert.deepEqual(cp.files['a.py'], { content: 'v1' });
        assert.equal(cp.createdAt, '2026-10-16T12:00:00.000Z');
    });
    it('a file that did not exist is deleted on undo; others are rewritten', () => {
        let cp = createCheckpoint('r1');
        cp = recordOriginal(cp, 'new.py', undefined);
        cp = recordOriginal(cp, 'old.py', 'orig');
        cp = recordOriginal(cp, 'empty.txt', '');
        assert.deepEqual(undoActions(cp), [
            { kind: 'delete', path: 'new.py' },
            { kind: 'write', path: 'old.py', content: 'orig' },
            { kind: 'write', path: 'empty.txt', content: '' },
        ]);
        assert.deepEqual(changedPaths(cp), ['new.py', 'old.py', 'empty.txt']);
    });
    it('recording never mutates the previous checkpoint', () => {
        const a = createCheckpoint('r1');
        const b = recordOriginal(a, 'x', 'y');
        assert.deepEqual(a.files, {});
        assert.notEqual(a, b);
    });
    it('state transitions', () => {
        const cp = createCheckpoint('r1');
        assert.equal(markKept(cp).state, 'kept');
        assert.equal(markUndone(cp).state, 'undone');
        assert.equal(cp.state, 'open');
    });
    it('round-trips through JSON and rejects malformed input', () => {
        const cp = recordOriginal(createCheckpoint('r1'), 'a', undefined);
        assert.deepEqual(parseCheckpoint(serializeCheckpoint(cp)), cp);
        assert.equal(parseCheckpoint('not json'), undefined);
        assert.equal(parseCheckpoint('{"runId":"x","files":{"a":5},"state":"open"}'), undefined);
        assert.equal(parseCheckpoint('{"runId":"x","files":{"a":null},"state":"open"}'), undefined);
        assert.ok(parseCheckpoint('{"runId":"x","files":{"a":{"absent":true},"b":{"content":""}},"state":"open"}'));
        assert.equal(parseCheckpoint('{"runId":"x","files":{},"state":"weird"}'), undefined);
        assert.equal(parseCheckpoint('null'), undefined);
        assert.equal(parseCheckpoint('5'), undefined);
    });
    it('run ids cannot escape the checkpoints folder', () => {
        assert.equal(checkpointFileName('../../etc/passwd'), '______etc_passwd.json');
        assert.equal(checkpointFileName('run-1_a'), 'run-1_a.json');
        assert.equal(checkpointFileName(''), 'run.json');
        assert.ok(!checkpointFileName('a/b').includes('/'));
    });
});
