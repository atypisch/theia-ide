/********************************************************************************
 * Soriku IDE — workbench preferences
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_TELEMETRY_ENABLED = 'soriku.telemetry.enabled';
export const SORIKU_ENGINE_AUTOCONNECT = 'soriku.engine.autoConnect';

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
    },
};
