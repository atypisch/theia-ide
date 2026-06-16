/********************************************************************************
 * Soriku IDE — engine status model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEngineStatusView, firstRunAction, shortHost } from '../common/engine-status';

describe('shortHost', () => {
    it('extracts host:port', () => {
        assert.equal(shortHost('http://127.0.0.1:8765'), '127.0.0.1:8765');
        assert.equal(shortHost('https://soriku.ai/api'), 'soriku.ai');
    });
    it('falls back to the raw string', () => {
        assert.equal(shortHost('not a url'), 'not a url');
    });
});

describe('computeEngineStatusView', () => {
    it('connected shows the host', () => {
        const view = computeEngineStatusView({ status: 'connected', baseUrl: 'http://127.0.0.1:8765' });
        assert.equal(view.text, 'Soriku: 127.0.0.1:8765');
    });
    it('connecting', () => {
        const view = computeEngineStatusView({ status: 'connecting', baseUrl: 'http://127.0.0.1:8765' });
        assert.equal(view.text, 'Soriku: connecting…');
    });
    it('unreachable includes the error in the tooltip', () => {
        const view = computeEngineStatusView({ status: 'unreachable', baseUrl: 'http://x:1', error: 'refused' });
        assert.equal(view.text, 'Engine unreachable');
        assert.ok(view.tooltip.includes('refused'));
    });
    it('idle shows a neutral not-connected label', () => {
        const view = computeEngineStatusView({ status: 'idle', baseUrl: '' });
        assert.equal(view.text, 'Soriku: not connected');
    });
});

describe('firstRunAction', () => {
    const LOCAL = 'http://127.0.0.1:8765';
    it('local sets the base URL and connects', () => {
        assert.deepEqual(firstRunAction('local', LOCAL), { setBaseUrl: LOCAL, startHostedAuth: false, connect: true });
    });
    it('hosted starts the sign-in flow without changing the URL', () => {
        assert.deepEqual(firstRunAction('hosted', LOCAL), { startHostedAuth: true, connect: false });
    });
    it('skip does nothing', () => {
        assert.deepEqual(firstRunAction('skip', LOCAL), { startHostedAuth: false, connect: false });
    });
});
