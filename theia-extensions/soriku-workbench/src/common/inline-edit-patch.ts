/********************************************************************************
 * Soriku IDE — ⌘K inline edit: pure patch-construction helpers (Theia/Monaco-
 * free, unit-testable). Kept out of soriku-inline-edit-controller.ts because
 * that file imports @theia/monaco-editor-core at module scope, which pulls in
 * @lumino/domutils and crashes under Node's plain test runner (no DOM).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { InlineEditHunk } from 'soriku-engine-client-ext/lib/common/engine-types';

/** One unified-diff hunk per InlineEditHunk, sorted ascending so applyUnifiedPatch's own overlap/order validation holds. */
export function buildCombinedPatch(hunks: readonly InlineEditHunk[]): string {
    const sorted = [...hunks].sort((a, b) => a.start_line - b.start_line);
    const parts: string[] = [];
    for (const hunk of sorted) {
        const oldLines = hunk.old_text.length > 0 ? hunk.old_text.split('\n') : [];
        const newLines = hunk.new_text.length > 0 ? hunk.new_text.split('\n') : [];
        const oldCount = oldLines.length;
        const newCount = newLines.length;
        parts.push(`@@ -${hunk.start_line},${oldCount} +${hunk.start_line},${newCount} @@`);
        for (const line of oldLines) {
            parts.push(`-${line}`);
        }
        for (const line of newLines) {
            parts.push(`+${line}`);
        }
    }
    return parts.join('\n');
}

export function countAddedLines(before: string, after: string): number {
    return Math.max(0, after.split('\n').length - before.split('\n').length);
}

export function countRemovedLines(before: string, after: string): number {
    return Math.max(0, before.split('\n').length - after.split('\n').length);
}
