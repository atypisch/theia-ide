/********************************************************************************
 * Soriku IDE — agent edit form model (pure, Theia-free, unit-testable)
 *
 * Maps an engine AgentPersona to/from the fields that PATCH /api/v1/agents
 * actually persists: name, role, description, system_prompt, preferred_model,
 * visibility. (Per-agent tool whitelist and routing mode are NOT persisted by
 * the engine — see the form's note — so they are intentionally absent here.)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentPersona, AgentUpdateRequest } from 'soriku-engine-client-ext/lib/common/engine-types';

export interface AgentForm {
    name: string;
    role: string;
    description: string;
    preferredModel: string;
    visibility: string;
    systemPrompt: string;
}

export function toAgentForm(persona: AgentPersona): AgentForm {
    return {
        name: persona.name ?? '',
        role: persona.role ?? '',
        description: persona.persona?.description ?? '',
        preferredModel: persona.preferred_model ?? '',
        visibility: persona.simezu?.visibility ?? '',
        systemPrompt: persona.intelligence?.system_prompt ?? '',
    };
}

/** Build the PATCH body. Visibility is only sent when set (engine ignores empty). */
export function buildUpdateRequest(form: AgentForm): AgentUpdateRequest {
    const body: AgentUpdateRequest = {
        name: form.name.trim(),
        role: form.role.trim(),
        description: form.description,
        preferred_model: form.preferredModel.trim(),
        system_prompt: form.systemPrompt,
    };
    const visibility = form.visibility.trim();
    if (visibility) {
        body.visibility = visibility;
    }
    return body;
}
