/********************************************************************************
 * Soriku IDE — follow plan SSE events broadcast from the engine (/api/events)
 *
 * Lets CLI/API-started plans appear live in the chat panel while they run.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { SorikuSseEvent } from '../common/engine-types';

@injectable()
export class SorikuPlanLiveBridge {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    protected readonly onDidReceivePlanEventEmitter = new Emitter<SorikuSseEvent>();
    readonly onDidReceivePlanEvent: Event<SorikuSseEvent> = this.onDidReceivePlanEventEmitter.event;

    protected source?: EventSource;
    protected engineBase = 'http://127.0.0.1:8765';
    // #19: reconnect with capped exponential backoff instead of a fixed 5s loop
    // hammering a down engine forever; a fired timer must be a no-op after dispose.
    protected reconnectTimer: number | undefined;
    protected reconnectAttempts = 0;
    protected disposed = false;

    protected static readonly RECONNECT_BASE_MS = 5_000;
    protected static readonly RECONNECT_MAX_MS = 60_000;

    @postConstruct()
    protected init(): void {
        const pref = this.preferences.get<string>('soriku.engineUrl', 'http://127.0.0.1:8765');
        this.engineBase = (pref || 'http://127.0.0.1:8765').replace(/\/$/, '');
        this.connect();
    }

    protected connect(): void {
        if (this.disposed) {
            return;
        }
        this.source?.close();
        try {
            this.source = new EventSource(`${this.engineBase}/api/events`);
            this.source.onopen = () => {
                this.reconnectAttempts = 0;   // link is healthy again — reset backoff
            };
            this.source.onmessage = ev => {
                try {
                    const data = JSON.parse(ev.data) as Record<string, unknown>;
                    if (data.channel !== 'plan_sse' || typeof data.type !== 'string') {
                        return;
                    }
                    const { channel: _c, ...rest } = data;
                    this.onDidReceivePlanEventEmitter.fire(rest as SorikuSseEvent);
                } catch {
                    /* ignore malformed */
                }
            };
            this.source.onerror = () => {
                this.source?.close();
                this.scheduleReconnect();
            };
        } catch {
            this.scheduleReconnect();
        }
    }

    protected scheduleReconnect(): void {
        if (this.disposed || this.reconnectTimer !== undefined) {
            return;
        }
        const exp = Math.min(this.reconnectAttempts, 10);
        const delay = Math.min(SorikuPlanLiveBridge.RECONNECT_BASE_MS * Math.pow(2, exp), SorikuPlanLiveBridge.RECONNECT_MAX_MS);
        this.reconnectAttempts += 1;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }

    dispose(): void {
        this.disposed = true;
        if (this.reconnectTimer !== undefined) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.source?.close();
        this.onDidReceivePlanEventEmitter.dispose();
    }
}
