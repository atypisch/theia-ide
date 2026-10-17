/********************************************************************************
 * Soriku IDE — conversation-title test
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { conversationTitle } from '../common/conversation-title';

describe('conversationTitle', () => {
    it('hides workspace-line titles, with or without a [tag]', () => {
        assert.equal(conversationTitle('Workspace: /private/tmp/cl'), 'Untitled chat');
        assert.equal(conversationTitle('[Pilot] Workspace: /private/var/folders/zl/xwgkf'), 'Untitled chat');
        assert.equal(conversationTitle('  '), 'Untitled chat');
        assert.equal(conversationTitle(undefined), 'Untitled chat');
    });
    it('keeps real titles and strips a leading tag', () => {
        assert.equal(conversationTitle('Fix the router'), 'Fix the router');
        assert.equal(conversationTitle('[Pilot] Fix the router'), 'Fix the router');
        assert.equal(conversationTitle('Notes [draft]'), 'Notes [draft]');
    });
});
