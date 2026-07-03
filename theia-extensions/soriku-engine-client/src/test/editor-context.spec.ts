/********************************************************************************
 * Soriku IDE — editor-context formatting unit tests (Fix A, audit C-A)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_OPEN_TABS,
    MAX_SELECTION_CHARS,
    buildEditorContextItems,
} from '../common/editor-context';

describe('buildEditorContextItems', () => {
    it('empty snapshot sends nothing (chat without an editor is unchanged)', () => {
        assert.deepEqual(buildEditorContextItems({}), []);
    });

    it('active file with language and cursor', () => {
        const items = buildEditorContextItems({ activeFilePath: '/ws/a.ts', languageId: 'typescript', cursorLine: 42 });
        assert.equal(items[0].type, 'text');
        assert.equal(items[0].value, 'Active file: /ws/a.ts, language typescript, cursor at line 42');
    });

    it('selection wins over cursor window and carries its range', () => {
        const items = buildEditorContextItems({
            activeFilePath: '/ws/a.ts',
            selectionText: 'const x = 1;',
            selectionStartLine: 10,
            selectionEndLine: 10,
            aroundCursor: 'SHOULD NOT APPEAR',
        });
        const sel = items.find(i => i.value.includes('selection'));
        assert.ok(sel);
        assert.match(sel.value, /\/ws\/a\.ts:10-10/);
        assert.match(sel.value, /const x = 1;/);
        assert.ok(!items.some(i => i.value.includes('SHOULD NOT APPEAR')));
    });

    it('caps an oversized selection and marks the truncation', () => {
        const items = buildEditorContextItems({
            activeFilePath: '/ws/a.ts',
            selectionText: 'x'.repeat(MAX_SELECTION_CHARS + 500),
        });
        const sel = items.find(i => i.value.includes('selection'));
        assert.ok(sel);
        assert.ok(sel.value.length < MAX_SELECTION_CHARS + 300);
        assert.match(sel.value, /truncated at/);
    });

    it('uses the cursor window when there is no selection', () => {
        const items = buildEditorContextItems({ activeFilePath: '/ws/a.ts', aroundCursor: 'line1\nline2' });
        const win = items.find(i => i.value.startsWith('Code around the cursor'));
        assert.ok(win);
        assert.match(win.value, /line1\nline2/);
    });

    it('caps the open-tab list and reports the remainder', () => {
        const tabs = Array.from({ length: MAX_OPEN_TABS + 3 }, (_, i) => `/ws/f${i}.ts`);
        const items = buildEditorContextItems({ openTabPaths: tabs });
        const tabItem = items.find(i => i.value.startsWith('Open editor tabs'));
        assert.ok(tabItem);
        assert.match(tabItem.value, /\(\+3 more\)/);
    });
});
