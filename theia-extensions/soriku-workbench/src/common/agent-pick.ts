/********************************************************************************
 * Soriku IDE — agent quick-pick model (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface AgentPickItem {
    id: string;
    label: string;
    description?: string;
}

/** Build quick-pick items for "Switch Active Agent" from the engine agent list. */
export function buildAgentPickItems(agents: AgentPersona[]): AgentPickItem[] {
    return agents.map(agent => {
        const description = agent.role?.trim() || agent.persona?.description?.trim() || undefined;
        return {
            id: agent.id,
            label: agent.name?.trim() || agent.id,
            description,
        };
    });
}
