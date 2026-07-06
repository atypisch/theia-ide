/********************************************************************************
 * Soriku IDE — theme + design-token frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/fonts.css';
import '../../src/browser/style/soriku-tokens.css';
import '../../src/browser/style/theia-color-overrides.css';
import '../../src/browser/style/soriku-base.css';
import '../../src/browser/ui/style/ui.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuThemeContribution } from './soriku-theme-contribution';
import { SorikuToastService } from './soriku-toast-service';
import { SorikuToastContribution } from './soriku-toast-contribution';

export default new ContainerModule(bind => {
    bind(SorikuThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuThemeContribution);

    bind(SorikuToastService).toSelf().inSingletonScope();
    bind(SorikuToastContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuToastContribution);
});
