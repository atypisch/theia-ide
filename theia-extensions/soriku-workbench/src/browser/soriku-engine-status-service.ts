/********************************************************************************
 * Soriku IDE — engine connection service (startup ping + state)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { EngineConnectionState, nextProbeDelay } from '../common/engine-status';

@injectable()
export class SorikuEngineStatusService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    protected state: EngineConnectionState = { status: 'idle', baseUrl: '' };

    protected readonly onDidChangeStateEmitter = new Emitter<EngineConnectionState>();
    readonly onDidChangeState: Event<EngineConnectionState> = this.onDidChangeStateEmitter.event;

    // Health monitoring (#9/#13): a single setTimeout chain — steady poll while
    // connected, exponential backoff while unreachable — so this service is the ONE
    // source of truth that also notices down→up without a manual reconnect.
    protected monitorTimer: ReturnType<typeof setTimeout> | undefined;
    protected monitoring = false;
    protected probing = false;
    protected failedAttempts = 0;

    getState(): EngineConnectionState {
        return this.state;
    }

    /** Ping the engine and update the connection state. Never throws. */
    async connect(): Promise<void> {
        const baseUrl = this.engineClient.getBaseUrl();
        this.setState({ status: 'connecting', baseUrl });
        try {
            await this.engineClient.ping();
            this.failedAttempts = 0;
            this.setState({ status: 'connected', baseUrl });
            this.conversationLink.notifyChanged();
        } catch (e) {
            this.failedAttempts += 1;
            this.setState({ status: 'unreachable', baseUrl, error: (e as Error).message });
        }
        // Every connect path (autoconnect, first-run, manual reconnect, URL switch)
        // opts into monitoring — no polling before the user ever chose to connect.
        this.startMonitoring();
    }

    /** Begin periodic health probing. Idempotent. */
    startMonitoring(): void {
        if (this.monitoring) {
            return;
        }
        this.monitoring = true;
        this.scheduleNextProbe();
    }

    stopMonitoring(): void {
        this.monitoring = false;
        if (this.monitorTimer !== undefined) {
            clearTimeout(this.monitorTimer);
            this.monitorTimer = undefined;
        }
    }

    /**
     * One health check now. Fires a state change ONLY on a transition (silent while
     * the status is unchanged — no event spam every poll). Public so tests can
     * drive the monitor without timers.
     */
    async probe(): Promise<void> {
        if (this.probing) {
            return;
        }
        this.probing = true;
        const baseUrl = this.engineClient.getBaseUrl();
        try {
            await this.engineClient.ping();
            this.failedAttempts = 0;
            if (this.state.status !== 'connected' || this.state.baseUrl !== baseUrl) {
                this.setState({ status: 'connected', baseUrl });
                this.conversationLink.notifyChanged();
            }
        } catch (e) {
            this.failedAttempts += 1;
            if (this.state.status !== 'unreachable') {
                this.setState({ status: 'unreachable', baseUrl, error: (e as Error).message });
            }
        } finally {
            this.probing = false;
        }
    }

    protected scheduleNextProbe(): void {
        if (!this.monitoring) {
            return;
        }
        if (this.monitorTimer !== undefined) {
            clearTimeout(this.monitorTimer);
        }
        this.monitorTimer = setTimeout(async () => {
            await this.probe();
            this.scheduleNextProbe();
        }, nextProbeDelay(this.state.status, this.failedAttempts));
    }

    protected setState(state: EngineConnectionState): void {
        this.state = state;
        this.onDidChangeStateEmitter.fire(state);
    }
}
