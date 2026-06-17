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
    protected activeName: string | undefined;
    protected readonly onDidChangeActiveEmitter = new Emitter<string | undefined>();
    readonly onDidChangeActive: Event<string | undefined> = this.onDidChangeActiveEmitter.event;

    getActiveId(): string | undefined {
        return this.activeId;
    }

    /** Display name of the active agent, if known (the engine is the source of truth). */
    getActiveName(): string | undefined {
        return this.activeName;
    }

    setActive(id: string | undefined, name?: string): void {
        if (id !== this.activeId || name !== this.activeName) {
            this.activeId = id;
            this.activeName = name;
            this.onDidChangeActiveEmitter.fire(id);
        }
    }
}
