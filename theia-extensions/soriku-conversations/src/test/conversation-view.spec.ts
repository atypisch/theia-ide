/********************************************************************************
 * Soriku IDE — conversation-history view helper tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, modeFromTitle, projectLabel, relativeAge } from '../common/conversation-view';

describe('relativeAge', () => {
    const now = Date.parse('2026-06-18T12:00:00Z');
    it('shows "now" for very recent', () => {
        assert.equal(relativeAge('2026-06-18T11:59:40Z', now), 'now');
    });
    it('shows minutes', () => {
        assert.equal(relativeAge('2026-06-18T11:30:00Z', now), '30m');
    });
    it('shows hours', () => {
        assert.equal(relativeAge('2026-06-18T09:00:00Z', now), '3u');
    });
    it('shows days', () => {
        assert.equal(relativeAge('2026-06-16T12:00:00Z', now), '2d');
    });
    it('handles bad input', () => {
        assert.equal(relativeAge('not-a-date', now), '');
    });
});

describe('cleanTitle', () => {
    it('passes a normal title through', () => {
        assert.equal(cleanTitle('[Plan] add README'), '[Plan] add README');
    });
    it('falls back for empty', () => {
        assert.equal(cleanTitle('   '), 'Untitled conversation');
    });
});

describe('modeFromTitle', () => {
    it('extracts the mode prefix', () => {
        assert.equal(modeFromTitle('[Plan] add README'), 'Plan');
        assert.equal(modeFromTitle('[Pilot] test'), 'Pilot');
    });
    it('returns undefined without a prefix', () => {
        assert.equal(modeFromTitle('hello'), undefined);
    });
});

describe('projectLabel', () => {
    it('shortens absolute paths', () => {
        assert.equal(projectLabel('/Users/me/Sites/sumezi/app'), 'sumezi/app');
    });
    it('returns undefined for empty', () => {
        assert.equal(projectLabel(null), undefined);
    });
});
