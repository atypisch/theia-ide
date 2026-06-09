/********************************************************************************
 * Soriku IDE — engine connection preferences
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const SORIKU_ENGINE_BASE_URL = 'soriku.engine.baseUrl';
export const SORIKU_ENGINE_AUTH_TOKEN = 'soriku.engine.authToken';
export const SORIKU_ENGINE_TIMEOUT = 'soriku.engine.timeout';

export const DEFAULT_ENGINE_BASE_URL = 'http://127.0.0.1:8765';
/** Default timeout for non-streaming engine calls, in milliseconds. */
export const DEFAULT_ENGINE_TIMEOUT_MS = 30000;

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
        [SORIKU_ENGINE_TIMEOUT]: {
            type: 'number',
            description: 'Timeout (in milliseconds) for non-streaming engine requests. '
                + 'Chat/SSE streams are never timed out. Set to 0 to disable.',
            default: DEFAULT_ENGINE_TIMEOUT_MS,
            minimum: 0,
            scope: PreferenceScope.User,
        },
    },
};
