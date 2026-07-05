/********************************************************************************
 * Soriku IDE — shell frontend DI module (titlebar, statusbar/palette theming)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/titlebar.css';
import '../../src/browser/style/statusbar.css';
import '../../src/browser/style/palette.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuTitlebarWidget } from './soriku-titlebar-widget';
import { SorikuTitlebarContribution } from './soriku-titlebar-contribution';

export default new ContainerModule(bind => {
    bind(SorikuTitlebarWidget).toSelf().inSingletonScope();
    bind(SorikuTitlebarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuTitlebarContribution);
});
