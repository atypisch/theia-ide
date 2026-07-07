/********************************************************************************
 * Soriku IDE — auth frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { SorikuAuthService } from './soriku-auth-service';
import { SorikuAuthContribution } from './soriku-auth-contribution';
import { SorikuAuthUriHandler } from './soriku-auth-uri-handler';

export default new ContainerModule(bind => {
    bind(SorikuAuthService).toSelf().inSingletonScope();

    bind(SorikuAuthContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuAuthContribution);
    bind(CommandContribution).toService(SorikuAuthContribution);

    bind(SorikuAuthUriHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(SorikuAuthUriHandler);
});
