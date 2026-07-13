/********************************************************************************
 * Soriku IDE — default agent resolution (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';

export const FALLBACK_AGENT_NAME = 'Koda';

export interface DefaultAgentCandidate {
    id: string;
    name: string;
    category?: string;
    avatarColor?: string;
}

/** Map an engine AgentPersona to the minimal shape default-agent resolution needs. */
export function toDefaultAgentCandidate(persona: AgentPersona): DefaultAgentCandidate {
    return {
        id: persona.id,
        name: persona.name?.trim() || persona.id,
        category: persona.category,
        avatarColor: persona.persona?.avatar_color,
    };
}

/**
 * Resolve which agent should become active when none is selected.
 *
 * Order: an exact id match against `preferredId` (the user's saved default) wins;
 * otherwise the first agent named "Koda" (case-insensitive, trimmed) is used;
 * otherwise `undefined` — the caller is responsible for creating Koda.
 */
export function resolveDefaultAgent(
    agents: readonly DefaultAgentCandidate[],
    preferredId?: string,
): DefaultAgentCandidate | undefined {
    if (preferredId) {
        const preferred = agents.find(a => a.id === preferredId);
        if (preferred) {
            return preferred;
        }
    }
    const fallbackName = FALLBACK_AGENT_NAME.toLowerCase();
    return agents.find(a => a.name.trim().toLowerCase() === fallbackName);
}
