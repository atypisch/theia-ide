/********************************************************************************
 * Soriku IDE — pure request-building for the "+ New agent" wizard (Phase 6.1)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { AgentCreateRequest } from 'soriku-engine-client-ext/lib/common/engine-types';
import { AgentCategory } from 'soriku-theme-ext/lib/browser/ui';

/**
 * Builds the engine create-agent payload from the wizard's three answers.
 *
 * `AgentCreateRequest` has no separate `category` field — category is
 * derived server-side from `role`, so the wizard's category choice is sent
 * as `role` (matching how the default-agent resolver already creates a
 * fallback agent with `role: 'coding'`). An empty/"auto" model selection
 * becomes `undefined` (let the router decide per request), never an empty
 * string sent over the wire.
 */
export function buildAgentCreateRequest(
    name: string,
    category: AgentCategory,
    preferredModel: string | undefined,
): AgentCreateRequest {
    return {
        name: name.trim(),
        role: category,
        preferred_model: preferredModel ? preferredModel : undefined,
    };
}
