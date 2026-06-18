/********************************************************************************
 * Soriku IDE — model-management view helper tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatModelSize, isRemoteModelId, isValidOllamaName, parsePullEvent } from '../common/models-view';

describe('formatModelSize', () => {
    it('formats GB to one decimal', () => {
        assert.equal(formatModelSize(4.42), '4.4 GB');
    });
    it('returns empty for missing/zero', () => {
        assert.equal(formatModelSize(undefined), '');
        assert.equal(formatModelSize(0), '');
    });
});

describe('parsePullEvent', () => {
    it('computes percent from completed/total', () => {
        const p = parsePullEvent({ type: 'pull', status: 'downloading', completed: 50, total: 200 });
        assert.equal(p.percent, 25);
        assert.equal(p.done, false);
        assert.equal(p.message, 'downloading');
    });
    it('marks success as done', () => {
        const p = parsePullEvent({ type: 'pull', status: 'success' });
        assert.equal(p.done, true);
    });
    it('surfaces errors', () => {
        const p = parsePullEvent({ type: 'pull', error: 'manifest not found' });
        assert.equal(p.done, true);
        assert.equal(p.error, 'manifest not found');
    });
    it('omits percent when total is missing', () => {
        const p = parsePullEvent({ type: 'pull', status: 'pulling manifest' });
        assert.equal(p.percent, undefined);
    });
});

describe('isRemoteModelId', () => {
    const remote = ['anthropic', 'groq', 'openai'];
    it('detects a remote prefix', () => {
        assert.equal(isRemoteModelId('anthropic:claude-opus-4-6', remote), true);
        assert.equal(isRemoteModelId('groq:llama-3.1-8b-instant', remote), true);
    });
    it('treats local ollama tags as local', () => {
        assert.equal(isRemoteModelId('qwen2.5-coder:7b', remote), false);
        assert.equal(isRemoteModelId('gemma3:4b', remote), false);
    });
});

describe('isValidOllamaName', () => {
    it('accepts plain and tagged names', () => {
        assert.equal(isValidOllamaName('llama3.2'), true);
        assert.equal(isValidOllamaName('qwen2.5-coder:7b'), true);
    });
    it('rejects empty or spaced names', () => {
        assert.equal(isValidOllamaName(''), false);
        assert.equal(isValidOllamaName('two words'), false);
    });
});
