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

    @postConstruct()
    protected init(): void {
        const pref = this.preferences.get<string>('soriku.engineUrl', 'http://127.0.0.1:8765');
        this.engineBase = (pref || 'http://127.0.0.1:8765').replace(/\/$/, '');
        this.connect();
    }

    protected connect(): void {
        this.source?.close();
        try {
            this.source = new EventSource(`${this.engineBase}/api/events`);
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
                window.setTimeout(() => this.connect(), 5000);
            };
        } catch {
            window.setTimeout(() => this.connect(), 5000);
        }
    }

    dispose(): void {
        this.source?.close();
        this.onDidReceivePlanEventEmitter.dispose();
    }
}
