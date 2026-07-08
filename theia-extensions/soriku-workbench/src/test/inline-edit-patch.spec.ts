/********************************************************************************
 * Soriku IDE — ⌘K inline edit patch-construction unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InlineEditHunk } from 'soriku-engine-client-ext/lib/common/engine-types';
import { applyUnifiedPatch } from 'soriku-tools-bridge-ext/lib/common/tool-delegation';
import { buildCombinedPatch } from '../common/inline-edit-patch';

function hunk(over: Partial<InlineEditHunk> & Pick<InlineEditHunk, 'start_line' | 'end_line' | 'old_text' | 'new_text'>): InlineEditHunk {
    return { description: '', ...over };
}

describe('buildCombinedPatch', () => {
    it('applies a single hunk correctly through the real applyUnifiedPatch', () => {
        const file = 'a\nb\nc\nd';
        const patch = buildCombinedPatch([hunk({ start_line: 2, end_line: 2, old_text: 'b', new_text: 'B' })]);
        assert.equal(applyUnifiedPatch(file, patch), 'a\nB\nc\nd');
    });

    it('applies multiple hunks in one combined patch, sorted regardless of input order', () => {
        const file = 'a\nb\nc\nd\ne';
        const patch = buildCombinedPatch([
            hunk({ start_line: 4, end_line: 4, old_text: 'd', new_text: 'D' }),
            hunk({ start_line: 1, end_line: 1, old_text: 'a', new_text: 'A' }),
        ]);
        assert.equal(applyUnifiedPatch(file, patch), 'A\nb\nc\nD\ne');
    });

    it('supports a multi-line replacement', () => {
        const file = 'a\nb\nc';
        const patch = buildCombinedPatch([hunk({ start_line: 1, end_line: 2, old_text: 'a\nb', new_text: 'X\nY\nZ' })]);
        assert.equal(applyUnifiedPatch(file, patch), 'X\nY\nZ\nc');
    });

    it('supports a pure deletion (empty new_text removes the line entirely, not a blank line)', () => {
        const file = 'a\nb\nc';
        const patch = buildCombinedPatch([hunk({ start_line: 2, end_line: 2, old_text: 'b', new_text: '' })]);
        assert.equal(applyUnifiedPatch(file, patch), 'a\nc');
    });

    it('throws (surfaces as a conflict) when old_text no longer matches the live buffer', () => {
        const liveFileChangedSinceProposal = 'a\nCHANGED\nc\nd';
        const patch = buildCombinedPatch([hunk({ start_line: 2, end_line: 2, old_text: 'b', new_text: 'B' })]);
        assert.throws(() => applyUnifiedPatch(liveFileChangedSinceProposal, patch));
    });
});
