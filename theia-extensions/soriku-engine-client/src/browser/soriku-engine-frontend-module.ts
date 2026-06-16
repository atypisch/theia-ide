/********************************************************************************
 * Soriku IDE — engine client frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { PreferenceContribution } from '@theia/core/lib/common';
import { EngineClient } from '../common/engine-client';
import { EngineClientImpl } from './engine-client-impl';
import { EngineAuthTokenHolder } from './engine-auth-token-holder';
import { sorikuEnginePreferenceSchema } from './soriku-engine-preferences';

export default new ContainerModule(bind => {
    bind(EngineAuthTokenHolder).toSelf().inSingletonScope();
    bind(EngineClientImpl).toSelf().inSingletonScope();
    bind(EngineClient).toService(EngineClientImpl);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuEnginePreferenceSchema });
});
