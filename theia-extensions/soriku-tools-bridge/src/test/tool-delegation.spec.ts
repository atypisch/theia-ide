/********************************************************************************
 * Soriku IDE — tool delegation model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DELEGATED_TOOLS, formatDirectoryListing, formatWriteResult, parseToolRequestEvent, truncateToMaxLines,
} from '../common/tool-delegation';

describe('parseToolRequestEvent', () => {
    it('parses a well-formed tool_request', () => {
        const req = parseToolRequestEvent({ type: 'tool_request', request_id: 'r1', tool: 'file_read', args: { path: 'a.txt' }, iteration: 2 });
        assert.deepEqual(req, { requestId: 'r1', tool: 'file_read', args: { path: 'a.txt' }, iteration: 2 });
    });
    it('ignores non tool_request events', () => {
        assert.equal(parseToolRequestEvent({ type: 'confirm_tool', request_id: 'r1', tool: 'x' }), undefined);
    });
    it('rejects events missing id or tool', () => {
        assert.equal(parseToolRequestEvent({ type: 'tool_request', tool: 'file_read' }), undefined);
        assert.equal(parseToolRequestEvent({ type: 'tool_request', request_id: 'r1' }), undefined);
    });
    it('defaults args to an empty object', () => {
        const req = parseToolRequestEvent({ type: 'tool_request', request_id: 'r1', tool: 'list_directory' });
        assert.deepEqual(req?.args, {});
    });
});

describe('DELEGATED_TOOLS', () => {
    it('covers the filesystem tools only', () => {
        assert.deepEqual([...DELEGATED_TOOLS], ['file_read', 'file_write', 'list_directory']);
    });
});

describe('formatDirectoryListing', () => {
    it('prefixes and sorts entries like the engine', () => {
        const out = formatDirectoryListing([
            { name: 'src', isDirectory: true },
            { name: 'README.md', isDirectory: false },
        ]);
        assert.equal(out, 'f README.md\nd src');
    });
    it('caps at 100 with an overflow line', () => {
        const many = Array.from({ length: 105 }, (_, i) => ({ name: `f${String(i).padStart(3, '0')}`, isDirectory: false }));
        const out = formatDirectoryListing(many);
        assert.equal(out.split('\n').length, 101);
        assert.ok(out.endsWith('... and 5 more'));
    });
    it('reports an empty directory', () => {
        assert.equal(formatDirectoryListing([]), '(empty directory)');
    });
});

describe('formatWriteResult', () => {
    it('matches the engine file_write JSON shape', () => {
        assert.equal(formatWriteResult('/ws/a.txt', 'a.txt', 5), JSON.stringify({ written: '/ws/a.txt', filename: 'a.txt', size: 5 }));
    });
});

describe('truncateToMaxLines', () => {
    it('passes short content through', () => {
        assert.equal(truncateToMaxLines('a\nb', 200), 'a\nb');
    });
    it('truncates and annotates long content', () => {
        const out = truncateToMaxLines('a\nb\nc\nd', 2);
        assert.equal(out, 'a\nb\n\n[... truncated, 2 more lines]');
    });
});
