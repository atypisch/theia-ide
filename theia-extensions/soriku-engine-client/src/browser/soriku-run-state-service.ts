/********************************************************************************
 * Soriku IDE — shared run-state bus: chat publishes, status bar reads
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { IDLE_RUN_STATE, RunStateSnapshot, sameRunState } from '../common/run-state';

@injectable()
export class SorikuRunStateService {

    protected state: RunStateSnapshot = IDLE_RUN_STATE;
    protected readonly onDidChangeEmitter = new Emitter<RunStateSnapshot>();
    readonly onDidChange: Event<RunStateSnapshot> = this.onDidChangeEmitter.event;

    get(): RunStateSnapshot {
        return this.state;
    }

    /** Publishes a new snapshot; listeners only fire when something actually changed. */
    publish(next: RunStateSnapshot): void {
        if (sameRunState(this.state, next)) { return; }
        this.state = next;
        this.onDidChangeEmitter.fire(next);
    }
}
