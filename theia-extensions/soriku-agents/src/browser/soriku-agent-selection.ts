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
export interface ActiveAgentInfo {
    id: string | undefined;
    name: string | undefined;
    /** Engine-assigned category (coding/reasoning/general/…), free-text, for AgentAvatar/Badge. */
    category: string | undefined;
    avatarColor: string | undefined;
}

@injectable()
export class SorikuAgentSelectionService {

    protected active: ActiveAgentInfo = { id: undefined, name: undefined, category: undefined, avatarColor: undefined };
    protected readonly onDidChangeActiveEmitter = new Emitter<string | undefined>();
    readonly onDidChangeActive: Event<string | undefined> = this.onDidChangeActiveEmitter.event;

    getActiveId(): string | undefined {
        return this.active.id;
    }

    /** Display name of the active agent, if known (the engine is the source of truth). */
    getActiveName(): string | undefined {
        return this.active.name;
    }

    /** Full active-agent info (id/name/category/avatarColor) for header rendering. */
    getActive(): Readonly<ActiveAgentInfo> {
        return this.active;
    }

    setActive(id: string | undefined, name?: string, category?: string, avatarColor?: string): void {
        const next: ActiveAgentInfo = { id, name, category, avatarColor };
        const changed = next.id !== this.active.id || next.name !== this.active.name
            || next.category !== this.active.category || next.avatarColor !== this.active.avatarColor;
        if (changed) {
            this.active = next;
            this.onDidChangeActiveEmitter.fire(id);
        }
    }
}
