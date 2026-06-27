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
export const SORIKU_ROUTING_CLOUD_CAP_EUR = 'soriku.routing.cloudCostCapEur';

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
        [SORIKU_ROUTING_CLOUD_CAP_EUR]: {
            type: 'number',
            description: 'Cap cloud spend per plan, in EUR. Local models are free, so this limits cloud usage: '
                + 'set 0 to block any paid (cloud) plan — strict local by cost. A negative value (default) means '
                + 'no IDE cap: the engine\'s own default applies (€1.00 per plan, €3.00 per day). '
                + 'Use the routing picker\'s "Local-first" for a hard local-only switch.',
            default: -1,
            scope: PreferenceScope.User,
        },
    },
};
