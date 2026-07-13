/********************************************************************************
 * Soriku IDE — resolves and activates a default agent when none is selected
 *
 * The chat panel must never be dead-locked on "no agent selected": this resolver
 * picks the user's preferred agent, falls back to an agent named "Koda", and as
 * a last resort creates Koda via the engine (POST /api/v1/agents dedupes by name,
 * so this is safe even if called concurrently or if Koda already exists).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAgentCatalog } from './soriku-agent-catalog';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { resolveDefaultAgent, toDefaultAgentCandidate, FALLBACK_AGENT_NAME } from '../common/default-agent';
import { SORIKU_DEFAULT_AGENT_ID } from './soriku-agents-preferences';

@injectable()
export class SorikuDefaultAgentResolver {

    @inject(SorikuAgentCatalog)
    protected readonly catalog: SorikuAgentCatalog;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    protected inflight: Promise<string | undefined> | undefined;

    /**
     * Ensures an agent is active, resolving and activating one if needed.
     * Idempotent and single-flight: concurrent callers share one resolution.
     * Never throws — an unreachable engine resolves to `undefined`.
     */
    ensureActiveAgent(): Promise<string | undefined> {
        const activeId = this.selection.getActiveId();
        if (activeId) {
            return Promise.resolve(activeId);
        }
        if (!this.inflight) {
            this.inflight = this.doResolve().finally(() => { this.inflight = undefined; });
        }
        return this.inflight;
    }

    protected async doResolve(): Promise<string | undefined> {
        try {
            const agents = await this.catalog.getAgents();
            const preferredId = this.getDefaultAgentId();
            let pick = resolveDefaultAgent(agents.map(toDefaultAgentCandidate), preferredId);
            if (!pick) {
                const created = await this.engineClient.createAgent({ name: FALLBACK_AGENT_NAME, role: 'coding' });
                this.catalog.invalidate();
                pick = toDefaultAgentCandidate(created.data);
            }
            this.selection.setActive(pick.id, pick.name, pick.category, pick.avatarColor);
            return pick.id;
        } catch {
            return undefined;
        }
    }

    getDefaultAgentId(): string | undefined {
        return this.preferences.get<string>(SORIKU_DEFAULT_AGENT_ID) || undefined;
    }

    async setDefaultAgent(id: string): Promise<void> {
        await this.preferences.set(SORIKU_DEFAULT_AGENT_ID, id, PreferenceScope.User);
    }
}
