/********************************************************************************
 * Soriku IDE — auth frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EngineAuthProvider } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAuthService } from './soriku-auth-service';
import { SorikuAuthTokenProvider } from './soriku-auth-token-provider';
import { SorikuAuthContribution } from './soriku-auth-contribution';

export default new ContainerModule(bind => {
    bind(SorikuAuthService).toSelf().inSingletonScope();

    bind(SorikuAuthTokenProvider).toSelf().inSingletonScope();
    bind(EngineAuthProvider).toService(SorikuAuthTokenProvider);

    bind(SorikuAuthContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuAuthContribution);
    bind(CommandContribution).toService(SorikuAuthContribution);
});
