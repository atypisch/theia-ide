/********************************************************************************
 * Soriku IDE — engine connection service (startup ping + state)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { EngineConnectionState } from '../common/engine-status';

@injectable()
export class SorikuEngineStatusService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    protected state: EngineConnectionState = { status: 'connecting', baseUrl: '' };

    protected readonly onDidChangeStateEmitter = new Emitter<EngineConnectionState>();
    readonly onDidChangeState: Event<EngineConnectionState> = this.onDidChangeStateEmitter.event;

    getState(): EngineConnectionState {
        return this.state;
    }

    /** Ping the engine and update the connection state. Never throws. */
    async connect(): Promise<void> {
        const baseUrl = this.engineClient.getBaseUrl();
        this.setState({ status: 'connecting', baseUrl });
        try {
            await this.engineClient.ping();
            this.setState({ status: 'connected', baseUrl });
        } catch (e) {
            this.setState({ status: 'unreachable', baseUrl, error: (e as Error).message });
        }
    }

    protected setState(state: EngineConnectionState): void {
        this.state = state;
        this.onDidChangeStateEmitter.fire(state);
    }
}
