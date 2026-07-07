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
import '../../src/browser/style/overlays.css';
import '../../src/browser/style/editor-chrome.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { SorikuTitlebarWidget } from './soriku-titlebar-widget';
import { SorikuTitlebarContribution } from './soriku-titlebar-contribution';
import { SorikuSidebarWidget } from './soriku-sidebar-widget';
import { SorikuSidebarContribution } from './soriku-sidebar-contribution';
import { SorikuOverlayService } from './soriku-overlay-service';
import { SorikuOverlayContribution } from './soriku-overlay-contribution';
import { SorikuQuickActionsContribution } from './soriku-quick-actions-contribution';
import { SorikuEditorToolbarContribution } from './soriku-editor-toolbar-contribution';

export default new ContainerModule(bind => {
    bind(SorikuTitlebarWidget).toSelf().inSingletonScope();
    bind(SorikuTitlebarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuTitlebarContribution);
    bind(CommandContribution).toService(SorikuTitlebarContribution);

    bind(SorikuSidebarWidget).toSelf().inSingletonScope();
    bind(SorikuSidebarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuSidebarContribution);

    bind(SorikuOverlayService).toSelf().inSingletonScope();
    bind(SorikuOverlayContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuOverlayContribution);
    bind(CommandContribution).toService(SorikuOverlayContribution);

    bind(SorikuQuickActionsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SorikuQuickActionsContribution);

    bind(SorikuEditorToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(SorikuEditorToolbarContribution);
    bind(CommandContribution).toService(SorikuEditorToolbarContribution);
});
