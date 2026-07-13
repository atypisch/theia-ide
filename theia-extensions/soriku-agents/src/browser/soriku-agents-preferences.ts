/********************************************************************************
 * Soriku IDE — agents preferences
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_DEFAULT_AGENT_ID = 'soriku.chat.defaultAgentId';

export const sorikuAgentsPreferenceSchema: PreferenceSchema = {
    properties: {
        [SORIKU_DEFAULT_AGENT_ID]: {
            type: 'string',
            description: 'Agent selected automatically when no agent is active (id). '
                + 'Empty falls back to the agent named "Koda", creating it if needed.',
            default: '',
            scope: PreferenceScope.User,
        },
    },
};
