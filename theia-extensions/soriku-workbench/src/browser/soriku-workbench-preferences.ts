/********************************************************************************
 * Soriku IDE — workbench preferences
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_TELEMETRY_ENABLED = 'soriku.telemetry.enabled';
export const SORIKU_ENGINE_AUTOCONNECT = 'soriku.engine.autoConnect';
export const SORIKU_ENGINE_FIRST_RUN_COMPLETE = 'soriku.engine.firstRunComplete';
export const SORIKU_UI_SUBAGENT_LABEL = 'soriku.ui.subagentLabel';

export const sorikuWorkbenchPreferenceSchema: PreferenceSchema = {
    properties: {
        [SORIKU_TELEMETRY_ENABLED]: {
            type: 'boolean',
            description: 'Send anonymous usage telemetry to Soriku. Off by default — strictly opt-in, never opt-out.',
            default: false,
            scope: PreferenceScope.User,
        },
        [SORIKU_ENGINE_AUTOCONNECT]: {
            type: 'boolean',
            description: 'Automatically connect to the Soriku engine on startup.',
            default: true,
            scope: PreferenceScope.User,
        },
        [SORIKU_ENGINE_FIRST_RUN_COMPLETE]: {
            type: 'boolean',
            description: 'Internal: set once the first-run engine connection prompt has been answered.',
            default: false,
            scope: PreferenceScope.User,
        },
        [SORIKU_UI_SUBAGENT_LABEL]: {
            type: 'string',
            description: 'What to call the sub-agents a head agent spawns during a run (Fase F). '
                + 'Shown in the Fleet view, e.g. "Minion fleet". Pick your own term ("minions", "helpers", "drones", …).',
            default: 'minions',
            scope: PreferenceScope.User,
        },
    },
};
