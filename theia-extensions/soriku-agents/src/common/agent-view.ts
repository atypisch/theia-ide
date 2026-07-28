/********************************************************************************
 * Soriku IDE — agent view model (pure, Theia-free, unit-testable)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentPersona } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface AgentItem {
    id: string;
    name: string;
    role: string;
    description: string;
    /** 1–2 letter avatar fallback derived from the name. */
    avatarText: string;
    /** Optional avatar background color supplied by the engine persona config. */
    avatarColor?: string;
    /** Engine-assigned category (coding/reasoning/general/…), free-text. */
    category: string;
    /** Specialization names (e.g. "SemVer", "CVEs") — the mockup's skill chips. */
    skills: string[];
    preferredModel?: string;
    /** Real system prompt (AgentIntelligence.system_prompt) — shown in the master-detail panel. */
    systemPrompt?: string;
    /** Tools this agent is restricted to (narrows its role's own allowlist) — empty/absent = unrestricted. */
    toolWhitelist: string[];
}

/** Derive a short avatar label (initials) from a display name. */
export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Map an engine AgentPersona to the view item rendered by the panel. */
export function toAgentItem(persona: AgentPersona): AgentItem {
    const name = persona.name?.trim() || persona.id;
    return {
        id: persona.id,
        name,
        role: persona.role ?? '',
        description: persona.persona?.description?.trim() ?? '',
        avatarText: initials(name),
        avatarColor: persona.persona?.avatar_color,
        category: persona.category ?? '',
        skills: (persona.specializations ?? []).map(s => s.name).filter(Boolean),
        preferredModel: persona.preferred_model ?? undefined,
        systemPrompt: persona.intelligence?.system_prompt?.trim() || undefined,
        toolWhitelist: persona.tool_whitelist ?? [],
    };
}

export function toAgentItems(personas: AgentPersona[]): AgentItem[] {
    return personas.map(toAgentItem);
}
