/********************************************************************************
 * Soriku IDE — shell frontend DI module (titlebar, unified sidebar,
 * statusbar/palette theming)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/titlebar.css';
import '../../src/browser/style/sidebar.css';
import '../../src/browser/style/statusbar.css';
import '../../src/browser/style/palette.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuTitlebarWidget } from './soriku-titlebar-widget';
import { SorikuTitlebarContribution } from './soriku-titlebar-contribution';
import { SorikuSidebarWidget } from './soriku-sidebar-widget';
import { SorikuSidebarContribution } from './soriku-sidebar-contribution';

export default new ContainerModule(bind => {
    bind(SorikuTitlebarWidget).toSelf().inSingletonScope();
    bind(SorikuTitlebarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuTitlebarContribution);

    bind(SorikuSidebarWidget).toSelf().inSingletonScope();
    bind(SorikuSidebarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuSidebarContribution);
});
