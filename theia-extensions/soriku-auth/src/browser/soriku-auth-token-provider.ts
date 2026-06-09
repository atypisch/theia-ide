/********************************************************************************
 * Soriku IDE — bridges the stored auth token into the EngineClient
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { EngineAuthProvider } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAuthService } from './soriku-auth-service';

@injectable()
export class SorikuAuthTokenProvider implements EngineAuthProvider {

    @inject(SorikuAuthService)
    protected readonly auth: SorikuAuthService;

    getToken(): string | undefined {
        return this.auth.getToken();
    }
}
