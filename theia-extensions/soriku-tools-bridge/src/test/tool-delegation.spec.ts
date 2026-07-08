/********************************************************************************
 * Soriku IDE — tool delegation model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyUnifiedPatch, computeLineDiffStats,
    DELEGATED_TOOLS, formatDirectoryListing, formatWriteResult, parseToolRequestEvent, pathKind,
    progressiveRevealFrames, truncateToMaxLines, normalizePosixPath, isPathWithinRoot, sessionAllowKey,
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

// ── Security: workspace path containment (#11) ──
describe('normalizePosixPath', () => {
    it('resolves . and .. and collapses slashes', () => {
        assert.equal(normalizePosixPath('/ws/./a//b/../c'), '/ws/a/c');
        assert.equal(normalizePosixPath('/ws/a/../..'), '/');
        assert.equal(normalizePosixPath('/ws/'), '/ws');
    });
});

describe('isPathWithinRoot (#11)', () => {
    const root = '/Users/m/Sites/app';
    it('allows the root itself and descendants', () => {
        assert.equal(isPathWithinRoot(root, root), true);
        assert.equal(isPathWithinRoot(root, root + '/src/index.ts'), true);
        assert.equal(isPathWithinRoot(root, root + '/a/../b.ts'), true);
    });
    it('rejects absolute paths outside the root', () => {
        assert.equal(isPathWithinRoot(root, '/etc/passwd'), false);
        assert.equal(isPathWithinRoot(root, '/Users/m/Sites/app-evil/x'), false); // prefix-but-not-descendant
    });
    it('rejects .. climbs out of the root', () => {
        assert.equal(isPathWithinRoot(root, root + '/../../secrets'), false);
        assert.equal(isPathWithinRoot(root, root + '/../app2/x'), false);
    });
});

// ── Security: session "allow always" key scoping (#12) ──
describe('sessionAllowKey (#12)', () => {
    it('scopes shell_exec by exact normalized command', () => {
        const k1 = sessionAllowKey('shell_exec', { command: 'ls -la' });
        const k2 = sessionAllowKey('shell_exec', { command: 'ls   -la' }); // whitespace-normalized → same
        const k3 = sessionAllowKey('shell_exec', { command: 'rm -rf /' }); // different command → different key
        assert.equal(k1, k2);
        assert.notEqual(k1, k3);
        assert.ok(k1.startsWith('shell_exec\n'));
    });
    it('accepts the cmd alias and tolerates missing/!object args', () => {
        assert.equal(sessionAllowKey('shell_exec', { cmd: 'pwd' }), sessionAllowKey('shell_exec', { command: 'pwd' }));
        assert.equal(sessionAllowKey('shell_exec', undefined), 'shell_exec\n');
    });
    it('keys other tools by name', () => {
        assert.equal(sessionAllowKey('file_write', { path: 'a.ts' }), 'file_write');
    });
});

describe('applyUnifiedPatch — strict validation (C-D)', () => {
    const original = 'alpha\nbeta\ngamma\ndelta';

    it('applies a correct patch (replace one line)', () => {
        const patch = '@@ -2,1 +2,1 @@\n-beta\n+BETA';
        assert.equal(applyUnifiedPatch(original, patch), 'alpha\nBETA\ngamma\ndelta');
    });

    it('applies a multi-hunk patch in order', () => {
        const patch = '@@ -1,2 +1,2 @@\n alpha\n-beta\n+B\n@@ -4,1 +4,1 @@\n-delta\n+D';
        assert.equal(applyUnifiedPatch(original, patch), 'alpha\nB\ngamma\nD');
    });

    it('THROWS on an offset hunk instead of silently corrupting (the old bug)', () => {
        // hunk says line 3, but the content there is 'gamma', not 'beta'
        const patch = '@@ -3,1 +3,1 @@\n-beta\n+BETA';
        assert.throws(() => applyUnifiedPatch(original, patch), /deletion mismatch at line 3/);
    });

    it('THROWS on a context mismatch', () => {
        const patch = '@@ -1,2 +1,2 @@\n WRONG\n-beta\n+B';
        assert.throws(() => applyUnifiedPatch(original, patch), /context mismatch at line 1/);
    });

    it('THROWS on out-of-order/overlapping hunks', () => {
        const patch = '@@ -3,1 +3,1 @@\n-gamma\n+G\n@@ -2,1 +2,1 @@\n-beta\n+B';
        assert.throws(() => applyUnifiedPatch(original, patch), /out-of-order/);
    });

    it('THROWS when a hunk starts beyond the end of the file', () => {
        const patch = '@@ -99,1 +99,1 @@\n-nope\n+x';
        assert.throws(() => applyUnifiedPatch(original, patch), /beyond end of file/);
    });

    it('THROWS on a patch without hunks (garbage in, loud error out)', () => {
        assert.throws(() => applyUnifiedPatch(original, 'just some prose'), /no @@ hunks/);
    });

    it('tolerates file headers, empty context lines and the no-newline marker', () => {
        const src = 'a\n\nb';
        const patch = '--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n\\ No newline at end of file';
        assert.equal(applyUnifiedPatch(src, patch), 'a\n\nB');
    });

    it('supports pure insertion via a -0,0 hunk into an empty file', () => {
        const patch = '@@ -0,0 +1,2 @@\n+first\n+second';
        assert.equal(applyUnifiedPatch('', patch), 'first\nsecond\n');
    });
});

describe('computeLineDiffStats (chat DiffBar)', () => {
    it('counts added lines for a brand-new file (empty before)', () => {
        const stats = computeLineDiffStats('', 'a\nb\nc');
        assert.deepEqual(stats, { added: 3, removed: 0 });
    });

    it('counts removed lines when a file is emptied', () => {
        const stats = computeLineDiffStats('a\nb\nc', '');
        assert.deepEqual(stats, { added: 0, removed: 3 });
    });

    it('reports zero added/removed for identical content', () => {
        const stats = computeLineDiffStats('a\nb\nc', 'a\nb\nc');
        assert.deepEqual(stats, { added: 0, removed: 0 });
    });

    it('counts a mix of unchanged, added and removed lines', () => {
        const stats = computeLineDiffStats('a\nb\nc', 'a\nx\nc\nd');
        assert.deepEqual(stats, { added: 2, removed: 1 });
    });

    it('returns undefined rather than compute when either side exceeds the 4000-line cap', () => {
        const huge = new Array(4001).fill('line').join('\n');
        assert.equal(computeLineDiffStats(huge, 'a'), undefined);
        assert.equal(computeLineDiffStats('a', huge), undefined);
    });
});
