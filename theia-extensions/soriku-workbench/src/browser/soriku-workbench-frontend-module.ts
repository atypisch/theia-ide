/********************************************************************************
 * Soriku IDE — workbench frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, PreferenceContribution } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuWorkbenchContribution } from './soriku-workbench-contribution';
import { SorikuEngineStatusService } from './soriku-engine-status-service';
import { SorikuEngineStatusContribution } from './soriku-engine-status-contribution';
import { sorikuWorkbenchPreferenceSchema } from './soriku-workbench-preferences';

export default new ContainerModule(bind => {
    bind(SorikuWorkbenchContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SorikuWorkbenchContribution);
    bind(KeybindingContribution).toService(SorikuWorkbenchContribution);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuWorkbenchPreferenceSchema });

    bind(SorikuEngineStatusService).toSelf().inSingletonScope();
    bind(SorikuEngineStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuEngineStatusContribution);
    bind(CommandContribution).toService(SorikuEngineStatusContribution);
});
