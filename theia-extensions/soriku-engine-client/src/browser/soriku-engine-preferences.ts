/********************************************************************************
 * Soriku IDE — engine connection preferences
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_ENGINE_BASE_URL = 'soriku.engine.baseUrl';
export const SORIKU_ENGINE_AUTH_TOKEN = 'soriku.engine.authToken';

export const DEFAULT_ENGINE_BASE_URL = 'http://127.0.0.1:8765';

export const sorikuEnginePreferenceSchema: PreferenceSchema = {
    properties: {
        [SORIKU_ENGINE_BASE_URL]: {
            type: 'string',
            description: 'Base URL of the Soriku engine (local or hosted).',
            default: DEFAULT_ENGINE_BASE_URL,
            scope: PreferenceScope.User,
        },
        [SORIKU_ENGINE_AUTH_TOKEN]: {
            type: 'string',
            description: 'Optional Bearer token for hosted/Simezu engine access.',
            default: '',
            scope: PreferenceScope.User,
        },
    },
};
