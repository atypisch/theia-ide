/********************************************************************************
 * Soriku IDE — engine status model unit tests
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EngineConnectionState, HEALTH_POLL_MS, computeEngineStatusView, engineStatusBarLabel, firstRunAction, nextProbeDelay, shortHost } from '../common/engine-status';
import { SorikuEngineStatusService } from '../browser/soriku-engine-status-service';

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

describe('engineStatusBarLabel', () => {
    it('connected shows "Engine :port" for a local engine', () => {
        assert.equal(engineStatusBarLabel({ status: 'connected', baseUrl: 'http://127.0.0.1:8765' }), 'Engine :8765');
    });
    it('connected falls back to the host when there is no port', () => {
        assert.equal(engineStatusBarLabel({ status: 'connected', baseUrl: 'https://soriku.ai/api' }), 'Engine soriku.ai');
    });
    it('connecting', () => {
        assert.equal(engineStatusBarLabel({ status: 'connecting', baseUrl: 'http://127.0.0.1:8765' }), 'Engine connecting…');
    });
    it('unreachable', () => {
        assert.equal(engineStatusBarLabel({ status: 'unreachable', baseUrl: 'http://x:1' }), 'Engine unreachable');
    });
    it('idle', () => {
        assert.equal(engineStatusBarLabel({ status: 'idle', baseUrl: '' }), 'Engine not connected');
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

describe('nextProbeDelay (#9/#13)', () => {
    it('polls steadily while connected', () => {
        assert.equal(nextProbeDelay('connected', 0), HEALTH_POLL_MS);
        assert.equal(nextProbeDelay('connected', 5), HEALTH_POLL_MS);   // attempts irrelevant when up
    });

    it('backs off exponentially while unreachable, capped', () => {
        assert.equal(nextProbeDelay('unreachable', 0), 2_000);
        assert.equal(nextProbeDelay('unreachable', 1), 4_000);
        assert.equal(nextProbeDelay('unreachable', 2), 8_000);
        assert.equal(nextProbeDelay('unreachable', 6), 60_000);   // hit the cap
        assert.equal(nextProbeDelay('unreachable', 50), 60_000);  // stays capped (no overflow)
    });
});

describe('SorikuEngineStatusService.probe (#13, timer-free)', () => {
    // svc is returned as `any` on purpose: the assertions inspect protected monitor
    // internals (failedAttempts/monitoring/monitorTimer) that have no public seam.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeService(pingImpl: () => Promise<void>): { svc: any; events: EngineConnectionState[]; setPing: (f: () => Promise<void>) => void } {
        let ping = pingImpl;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = new SorikuEngineStatusService() as any;
        svc.engineClient = { getBaseUrl: () => 'http://e:1', ping: () => ping() };
        svc.conversationLink = { notifyChanged: () => { /* noop */ } };
        const events: EngineConnectionState[] = [];
        svc.onDidChangeState((e: EngineConnectionState) => events.push(e));
        return { svc, events, setPing: f => { ping = f; } };
    }

    it('detects down→up without a manual reconnect and fires only on transitions', async () => {
        const { svc, events, setPing } = makeService(() => Promise.reject(new Error('refused')));
        await svc.probe();                       // down
        await svc.probe();                       // still down — no extra event
        assert.deepEqual(events.map(e => e.status), ['unreachable']);
        setPing(() => Promise.resolve());
        await svc.probe();                       // engine came back
        assert.deepEqual(events.map(e => e.status), ['unreachable', 'connected']);
    });

    it('resets the backoff counter on success', async () => {
        const { svc, setPing } = makeService(() => Promise.reject(new Error('refused')));
        await svc.probe();
        await svc.probe();
        assert.equal(svc.failedAttempts, 2);
        setPing(() => Promise.resolve());
        await svc.probe();
        assert.equal(svc.failedAttempts, 0);
    });

    it('connect() starts monitoring exactly once and stopMonitoring clears the timer', async () => {
        const { svc, setPing } = makeService(() => Promise.resolve());
        await svc.connect();
        assert.equal(svc.monitoring, true);
        assert.notEqual(svc.monitorTimer, undefined);
        setPing(() => Promise.resolve());
        await svc.connect();                     // second connect stays idempotent
        svc.stopMonitoring();
        assert.equal(svc.monitoring, false);
        assert.equal(svc.monitorTimer, undefined);
    });
});
