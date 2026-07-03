/********************************************************************************
 * Soriku IDE — collect editor state for engine context (Fix A, audit C-A)
 *
 * Reads the ACTIVE editor (Theia's EditorManager tracks most-recently-focused,
 * which survives focus moving to the chat input), the selection or a cursor
 * window, and the open tabs. Collection is synchronous and cheap; formatting +
 * caps live in common/editor-context.ts (pure, tested). Failure-silent: any
 * trouble yields an empty snapshot — never a broken send.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EditorSnapshot } from '../common/editor-context';

/** Lines captured around the cursor when there is no selection. */
const CURSOR_WINDOW_LINES = 30;

@injectable()
export class SorikuEditorContextCollector {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    /** Snapshot the current editor state. Never throws. */
    collect(): EditorSnapshot {
        try {
            const widget = this.editorManager.currentEditor;
            const editor = widget?.editor;
            const snap: EditorSnapshot = {};
            if (editor) {
                snap.activeFilePath = editor.uri.path.toString();
                snap.languageId = editor.document.languageId;
                snap.cursorLine = editor.cursor.line + 1;   // TextEditor positions are 0-based
                const sel = editor.selection;
                const hasSelection = sel && (sel.start.line !== sel.end.line || sel.start.character !== sel.end.character);
                if (hasSelection) {
                    snap.selectionText = editor.document.getText(sel);
                    snap.selectionStartLine = sel.start.line + 1;
                    snap.selectionEndLine = sel.end.line + 1;
                } else {
                    snap.aroundCursor = this.cursorWindow(editor.document.getText(), editor.cursor.line);
                }
            }
            const tabs = this.editorManager.all
                .map(w => w.editor.uri.path.toString())
                .filter(p => !!p);
            if (tabs.length > 0) {
                snap.openTabPaths = tabs;
            }
            return snap;
        } catch {
            return {};
        }
    }

    /** ±CURSOR_WINDOW_LINES around the (0-based) cursor line. */
    protected cursorWindow(fullText: string, cursorLine0: number): string {
        const lines = fullText.split('\n');
        const start = Math.max(0, cursorLine0 - CURSOR_WINDOW_LINES);
        const end = Math.min(lines.length, cursorLine0 + CURSOR_WINDOW_LINES + 1);
        return lines.slice(start, end).join('\n');
    }
}
