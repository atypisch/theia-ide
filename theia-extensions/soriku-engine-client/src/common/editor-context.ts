/********************************************************************************
 * Soriku IDE — editor context → engine context items (pure, Theia-free, testable)
 *
 * Fix A (audit C-A): chat was blind to the editor — no active file, selection,
 * cursor or open tabs ever reached the engine. This module owns the FORMATTING:
 * a snapshot of editor state (collected by the browser-side collector) becomes
 * capped `ChatContextItem`s the engine already accepts. Caps keep a huge
 * selection or tab list from blowing the prompt budget; truncation is marked so
 * the model knows it is looking at an excerpt.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ChatContextItem } from './engine-types';

/** What the collector saw in the editor at send time. All fields optional. */
export interface EditorSnapshot {
    /** Workspace-absolute path of the active (most recently focused) editor. */
    activeFilePath?: string;
    languageId?: string;
    /** 1-based cursor line in the active editor. */
    cursorLine?: number;
    /** Selected text, when a non-empty selection exists. */
    selectionText?: string;
    /** 1-based selection line range. */
    selectionStartLine?: number;
    selectionEndLine?: number;
    /** Lines around the cursor when there is NO selection (the likely referent of "this"). */
    aroundCursor?: string;
    /** Paths of open editor tabs (active first not required). */
    openTabPaths?: string[];
}

export const MAX_SELECTION_CHARS = 6000;
export const MAX_AROUND_CURSOR_CHARS = 2500;
export const MAX_OPEN_TABS = 12;

function capped(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, max)}\n…(truncated at ${max} chars)`;
}

/**
 * Format an editor snapshot as engine context items. Empty snapshot → [] (a chat
 * without an open editor sends exactly what it sends today). Order: active file,
 * selection (or cursor window), open tabs — most-specific first.
 */
export function buildEditorContextItems(snap: EditorSnapshot): ChatContextItem[] {
    const items: ChatContextItem[] = [];
    if (snap.activeFilePath) {
        const lang = snap.languageId ? `, language ${snap.languageId}` : '';
        const cursor = snap.cursorLine !== undefined ? `, cursor at line ${snap.cursorLine}` : '';
        items.push({ type: 'text', value: `Active file: ${snap.activeFilePath}${lang}${cursor}` });
    }
    if (snap.selectionText && snap.selectionText.trim()) {
        const at = snap.activeFilePath ?? 'active file';
        const range = snap.selectionStartLine !== undefined && snap.selectionEndLine !== undefined
            ? `:${snap.selectionStartLine}-${snap.selectionEndLine}`
            : '';
        items.push({
            type: 'text',
            value: `User's current selection (${at}${range}) — the likely referent of "this":\n${capped(snap.selectionText, MAX_SELECTION_CHARS)}`,
        });
    } else if (snap.aroundCursor && snap.aroundCursor.trim() && snap.activeFilePath) {
        items.push({
            type: 'text',
            value: `Code around the cursor (${snap.activeFilePath}):\n${capped(snap.aroundCursor, MAX_AROUND_CURSOR_CHARS)}`,
        });
    }
    if (snap.openTabPaths && snap.openTabPaths.length > 0) {
        const shown = snap.openTabPaths.slice(0, MAX_OPEN_TABS);
        const more = snap.openTabPaths.length - shown.length;
        items.push({
            type: 'text',
            value: `Open editor tabs: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`,
        });
    }
    return items;
}
