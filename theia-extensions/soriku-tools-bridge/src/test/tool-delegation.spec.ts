/********************************************************************************
 * Soriku IDE — tool delegation model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DELEGATED_TOOLS, formatDirectoryListing, formatWriteResult, parseToolRequestEvent, pathKind,
    progressiveRevealFrames, truncateToMaxLines,
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
        assert.deepEqual([...DELEGATED_TOOLS], [
            'file_read', 'file_write', 'list_directory', 'apply_patch', 'project_search', 'shell_exec',
        ]);
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

describe('pathKind', () => {
    it('empty/blank → root', () => {
        assert.equal(pathKind(''), 'root');
        assert.equal(pathKind('   '), 'root');
    });
    it('leading slash → absolute', () => {
        assert.equal(pathKind('/Users/x/a.txt'), 'absolute');
    });
    it('otherwise → relative (resolved against workspace root)', () => {
        assert.equal(pathKind('src/a.ts'), 'relative');
        assert.equal(pathKind('a.txt'), 'relative');
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

describe('progressiveRevealFrames', () => {
    it('starts empty, grows cumulatively, ends with full content', () => {
        const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
        const frames = progressiveRevealFrames(content, 4);
        assert.equal(frames[0], '');
        assert.equal(frames[frames.length - 1], content);
        // each frame is a prefix of the final content and non-decreasing in length
        for (let i = 1; i < frames.length; i++) {
            assert.ok(content.startsWith(frames[i]) || frames[i] === content);
            assert.ok(frames[i].length >= frames[i - 1].length);
        }
        assert.ok(frames.length <= 6); // ~maxFrames + endpoints
    });

    it('handles empty content', () => {
        assert.deepEqual(progressiveRevealFrames(''), ['']);
    });
});
