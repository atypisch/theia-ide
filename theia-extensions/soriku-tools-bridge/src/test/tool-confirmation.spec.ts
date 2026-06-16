/********************************************************************************
 * Soriku IDE — tool confirmation model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    describeToolConfirmation,
    isDestructive,
    parseConfirmToolEvent,
    summarizeArgs,
} from '../common/tool-confirmation';

describe('parseConfirmToolEvent', () => {
    it('parses a valid confirm_tool event', () => {
        const req = parseConfirmToolEvent({
            type: 'confirm_tool',
            confirmation_id: 'c1',
            tool: 'file_write',
            args: { path: 'a.ts' },
            iteration: 2,
        });
        assert.deepEqual(req, { confirmationId: 'c1', tool: 'file_write', args: { path: 'a.ts' }, iteration: 2 });
    });

    it('ignores non confirm_tool events', () => {
        assert.equal(parseConfirmToolEvent({ type: 'chunk', content: 'x' }), undefined);
    });

    it('returns undefined when id or tool is missing', () => {
        assert.equal(parseConfirmToolEvent({ type: 'confirm_tool', tool: 'file_read' }), undefined);
        assert.equal(parseConfirmToolEvent({ type: 'confirm_tool', confirmation_id: 'c1' }), undefined);
    });
});

describe('isDestructive', () => {
    it('flags write/delete/shell tools', () => {
        assert.equal(isDestructive('file_write'), true);
        assert.equal(isDestructive('shell_exec'), true);
        assert.equal(isDestructive('file_read'), false);
        assert.equal(isDestructive('workspace_search'), false);
    });
});

describe('summarizeArgs', () => {
    it('stringifies objects', () => {
        assert.equal(summarizeArgs({ a: 1 }), '{"a":1}');
    });
    it('passes through strings', () => {
        assert.equal(summarizeArgs('ls -la'), 'ls -la');
    });
    it('returns empty for nullish', () => {
        assert.equal(summarizeArgs(undefined), '');
        assert.equal(summarizeArgs(JSON.parse('null')), '');
    });
    it('truncates long content', () => {
        const long = 'x'.repeat(500);
        const out = summarizeArgs(long, 10);
        assert.equal(out.length, 11); // 10 chars + ellipsis
        assert.ok(out.endsWith('…'));
    });
});

describe('describeToolConfirmation', () => {
    it('marks destructive tools and includes args', () => {
        const view = describeToolConfirmation({ confirmationId: 'c1', tool: 'shell_exec', args: { cmd: 'rm -rf x' } });
        assert.equal(view.destructive, true);
        assert.equal(view.title, 'Confirm destructive tool');
        assert.ok(view.message.includes('shell_exec'));
        assert.ok(view.message.includes('rm -rf x'));
    });

    it('uses a softer title for read-only tools', () => {
        const view = describeToolConfirmation({ confirmationId: 'c2', tool: 'file_read', args: { path: 'a.ts' } });
        assert.equal(view.destructive, false);
        assert.equal(view.title, 'Confirm tool');
    });
});
