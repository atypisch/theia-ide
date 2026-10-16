/********************************************************************************
 * Soriku IDE — chat-format spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clockTime, formatDuration, historyTitle, modelLine, plural, relativeTime, signed } from '../common/chat-format';

const NOW = new Date('2026-10-16T12:00:00Z');

describe('relativeTime', () => {
    it('buckets by age', () => {
        assert.equal(relativeTime('2026-10-16T11:59:40Z', NOW), 'just now');
        assert.equal(relativeTime('2026-10-16T11:55:00Z', NOW), '5m');
        assert.equal(relativeTime('2026-10-16T09:00:00Z', NOW), '3h');
        assert.equal(relativeTime('2026-10-14T12:00:00Z', NOW), '2d');
    });
    it('is empty for missing or invalid input and never negative', () => {
        assert.equal(relativeTime(undefined, NOW), '');
        assert.equal(relativeTime('nope', NOW), '');
        assert.equal(relativeTime('2026-10-16T13:00:00Z', NOW), 'just now');
    });
    it('falls back to a date after a week', () => {
        assert.notEqual(relativeTime('2026-09-01T12:00:00Z', NOW), '');
        assert.ok(!relativeTime('2026-09-01T12:00:00Z', NOW).endsWith('d'));
    });
});

describe('formatDuration', () => {
    it('formats like the design ("1m 48s")', () => {
        assert.equal(formatDuration(108_000), '1m 48s');
        assert.equal(formatDuration(2500), '2.5s');
        assert.equal(formatDuration(45_000), '45s');
        assert.equal(formatDuration(400), '<1s');
        assert.equal(formatDuration(undefined), '');
        assert.equal(formatDuration(-5), '');
    });
});

describe('plural / signed / modelLine', () => {
    it('handle the small display cases', () => {
        assert.equal(plural(1, 'file'), '1 file');
        assert.equal(plural(3, 'file'), '3 files');
        assert.equal(plural(2, 'agent', 'agents'), '2 agents');
        assert.equal(signed(18, '+'), '+18');
        assert.equal(signed(2, '−'), '−2');
        assert.equal(signed(undefined, '+'), '');
        assert.equal(modelLine('qwen2.5-coder:7b', true, true), 'Auto → qwen2.5-coder:7b · local');
        assert.equal(modelLine('claude', false, false), 'claude · cloud');
        assert.equal(modelLine('m', false, undefined), 'm');
        assert.equal(modelLine(undefined, true, true), undefined);
    });
});

describe('clockTime', () => {
    it('formats HH:MM and tolerates missing input', () => {
        assert.match(clockTime(new Date('2026-10-16T14:22:00').getTime()), /^14[:.]22$/);
        assert.equal(clockTime(undefined), '');
        assert.equal(clockTime(Number.NaN), '');
    });
});

describe('historyTitle', () => {
    it('hides workspace-line titles', () => {
        assert.equal(historyTitle('Workspace: /private/tmp/cl'), 'Untitled chat');
        assert.equal(historyTitle(''), 'Untitled chat');
        assert.equal(historyTitle(undefined), 'Untitled chat');
        assert.equal(historyTitle('Fix the router'), 'Fix the router');
    });
});
