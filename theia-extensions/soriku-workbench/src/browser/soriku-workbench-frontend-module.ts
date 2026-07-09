/********************************************************************************
 * Soriku IDE — workbench frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/settings.css';
import '../../src/browser/style/inline-edit.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, PreferenceContribution } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuWorkbenchContribution } from './soriku-workbench-contribution';
import { SorikuInlineEditController } from './soriku-inline-edit-controller';
import { SorikuEngineStatusService } from './soriku-engine-status-service';
import { SorikuEngineStatusContribution } from './soriku-engine-status-contribution';
import { SorikuWarmModelStatusContribution } from './soriku-warm-model-status-contribution';
import { SorikuTerminalToggleStatusContribution } from './soriku-terminal-toggle-status-contribution';
import { sorikuWorkbenchPreferenceSchema } from './soriku-workbench-preferences';
import { SorikuSettingsWidget } from './soriku-settings-widget';
import { SorikuSettingsViewContribution } from './soriku-settings-view-contribution';

export default new ContainerModule(bind => {
    bind(SorikuInlineEditController).toSelf().inSingletonScope();

    bind(SorikuWorkbenchContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SorikuWorkbenchContribution);
    bind(KeybindingContribution).toService(SorikuWorkbenchContribution);
    bind(FrontendApplicationContribution).toService(SorikuWorkbenchContribution);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuWorkbenchPreferenceSchema });

    bind(SorikuEngineStatusService).toSelf().inSingletonScope();
    bind(SorikuEngineStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuEngineStatusContribution);
    bind(CommandContribution).toService(SorikuEngineStatusContribution);

    bind(SorikuWarmModelStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuWarmModelStatusContribution);

    bind(SorikuTerminalToggleStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuTerminalToggleStatusContribution);

    bind(SorikuSettingsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuSettingsWidget.ID,
        createWidget: () => ctx.container.get<SorikuSettingsWidget>(SorikuSettingsWidget),
    })).inSingletonScope();
    bindViewContribution(bind, SorikuSettingsViewContribution);
});
