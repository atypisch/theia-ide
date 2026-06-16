/********************************************************************************
 * Soriku IDE — auth frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuAuthService } from './soriku-auth-service';
import { SorikuAuthContribution } from './soriku-auth-contribution';

export default new ContainerModule(bind => {
    bind(SorikuAuthService).toSelf().inSingletonScope();

    bind(SorikuAuthContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuAuthContribution);
    bind(CommandContribution).toService(SorikuAuthContribution);
});
