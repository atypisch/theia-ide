/********************************************************************************
 * Soriku IDE — active-agent selection (shared with chat & inline commands)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';

/**
 * Tracks which agent is currently "active" in the IDE. The agents panel sets it; the chat widget
 * and later inline commands read it. Kept deliberately tiny — the engine is the source of truth.
 */
@injectable()
export class SorikuAgentSelectionService {

    protected activeId: string | undefined;
    protected readonly onDidChangeActiveEmitter = new Emitter<string | undefined>();
    readonly onDidChangeActive: Event<string | undefined> = this.onDidChangeActiveEmitter.event;

    getActiveId(): string | undefined {
        return this.activeId;
    }

    setActive(id: string | undefined): void {
        if (id !== this.activeId) {
            this.activeId = id;
            this.onDidChangeActiveEmitter.fire(id);
        }
    }
}
