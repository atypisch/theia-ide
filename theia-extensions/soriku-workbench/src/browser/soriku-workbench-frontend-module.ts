/********************************************************************************
 * Soriku IDE — workbench frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, PreferenceContribution } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { SorikuWorkbenchContribution } from './soriku-workbench-contribution';
import { sorikuWorkbenchPreferenceSchema } from './soriku-workbench-preferences';

export default new ContainerModule(bind => {
    bind(SorikuWorkbenchContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SorikuWorkbenchContribution);
    bind(KeybindingContribution).toService(SorikuWorkbenchContribution);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuWorkbenchPreferenceSchema });
});
