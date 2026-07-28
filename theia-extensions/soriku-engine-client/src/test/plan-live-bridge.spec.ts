/********************************************************************************
 * Soriku IDE — plan-live-bridge preference-key regression test
 *
 * B1 bug: this bridge read the WRONG preference key ('soriku.engineUrl',
 * which is never registered anywhere) instead of the real registered key
 * (soriku.engine.baseUrl / SORIKU_ENGINE_BASE_URL) — so a hosted/Simezu
 * engine URL was silently ignored and CLI/API-started plans never showed up
 * live for hosted users, who also got a permanent failing localhost
 * EventSource reconnect loop. This test drives the real class (no DI
 * container needed — @postConstruct is just a plain method here) with a
 * fake PreferenceService and a fake global EventSource.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SorikuPlanLiveBridge } from '../browser/soriku-plan-live-bridge';
import { DEFAULT_ENGINE_BASE_URL, SORIKU_ENGINE_BASE_URL } from '../browser/soriku-engine-preferences';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen?: () => void;
    onmessage?: (e: { data: string }) => void;
    onerror?: () => void;
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    close(): void { /* no-op */ }
}

function withFakeEventSource<T>(run: () => T): T {
    const g = globalThis as unknown as { EventSource: unknown };
    const original = g.EventSource;
    FakeEventSource.instances = [];
    g.EventSource = FakeEventSource;
    try {
        return run();
    } finally {
        g.EventSource = original;
    }
}

interface FakePreferences {
    get<T>(key: string, defaultValue: T): T;
    onPreferenceChanged: () => { dispose(): void };
    seenKeys: string[];
}

function fakePreferences(value: string | undefined): FakePreferences {
    const seenKeys: string[] = [];
    return {
        seenKeys,
        get: <T>(key: string, defaultValue: T): T => {
            seenKeys.push(key);
            return key === SORIKU_ENGINE_BASE_URL && value !== undefined ? (value as unknown as T) : defaultValue;
        },
        onPreferenceChanged: () => ({ dispose: () => { /* no-op */ } }),
    };
}

/** Constructs the bridge and runs its @postConstruct init without a DI container — decorators don't fire outside Inversify, so this calls the same method directly. */
function initBridge(prefs: FakePreferences): SorikuPlanLiveBridge {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = Object.create(SorikuPlanLiveBridge.prototype) as any;
    bridge.preferences = prefs;
    bridge.init();
    return bridge as SorikuPlanLiveBridge;
}

describe('SorikuPlanLiveBridge — engine base URL preference (B1)', () => {
    it('reads the registered soriku.engine.baseUrl key, not a made-up one', () => {
        withFakeEventSource(() => {
            const prefs = fakePreferences('https://hosted.example.com');
            initBridge(prefs);
            assert.ok(prefs.seenKeys.includes(SORIKU_ENGINE_BASE_URL));
        });
    });

    it('connects to the hosted engine URL from the preference, not localhost', () => {
        withFakeEventSource(() => {
            initBridge(fakePreferences('https://hosted.example.com'));
            assert.equal(FakeEventSource.instances.length, 1);
            assert.equal(FakeEventSource.instances[0].url, 'https://hosted.example.com/api/events');
        });
    });

    it('strips a trailing slash from the configured base URL', () => {
        withFakeEventSource(() => {
            initBridge(fakePreferences('https://hosted.example.com/'));
            assert.equal(FakeEventSource.instances[0].url, 'https://hosted.example.com/api/events');
        });
    });

    it('falls back to the local default when no preference is set', () => {
        withFakeEventSource(() => {
            initBridge(fakePreferences(undefined));
            assert.equal(FakeEventSource.instances[0].url, `${DEFAULT_ENGINE_BASE_URL}/api/events`);
        });
    });
});
