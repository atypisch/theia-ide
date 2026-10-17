/********************************************************************************
 * Soriku IDE — engine-log spec
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEngineLogLine } from '../common/engine-log';

const AT = new Date(2026, 9, 17, 9, 5, 7);

describe('formatEngineLogLine', () => {
    it('formats channel, type and the most useful details', () => {
        assert.equal(
            formatEngineLogLine({ channel: 'plan_sse', type: 'worker_start', model: 'qwen2.5-coder:7b', role: 'backend-developer' }, AT),
            '09:05:07  plan_sse/worker_start  qwen2.5-coder:7b · backend-developer');
    });
    it('defaults the channel and works without details', () => {
        assert.equal(formatEngineLogLine({ type: 'plan_done' }, AT), '09:05:07  engine/plan_done');
    });
    it('skips noisy streaming frames and malformed input', () => {
        assert.equal(formatEngineLogLine({ type: 'chunk', content: 'x' }, AT), undefined);
        assert.equal(formatEngineLogLine({ type: 'worker_chunk' }, AT), undefined);
        assert.equal(formatEngineLogLine({ channel: 'x' }, AT), undefined);
    });
    it('clips long text to one line and takes at most three details', () => {
        const line = formatEngineLogLine({ type: 'error', model: 'm', role: 'r', tool: 't', goal: 'ignored', message: 'a\n b'.repeat(80) }, AT)!;
        assert.ok(!line.includes('\n'));
        assert.ok(!line.includes('ignored'));
        assert.ok(line.length < 200);
    });
});
