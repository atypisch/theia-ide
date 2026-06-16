/********************************************************************************
 * Soriku IDE — engine auth token holder
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';

/**
 * A dependency-free singleton that holds the current bearer token. The EngineClient reads it; an
 * auth extension (soriku-auth) writes it. This deliberately inverts the dependency so the
 * EngineClient never depends on the auth extension (which itself depends on the EngineClient).
 */
@injectable()
export class EngineAuthTokenHolder {
    protected token: string | undefined;

    getToken(): string | undefined {
        return this.token;
    }

    setToken(token: string | undefined): void {
        this.token = token;
    }
}
