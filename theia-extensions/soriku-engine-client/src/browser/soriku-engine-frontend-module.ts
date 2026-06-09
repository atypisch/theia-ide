/********************************************************************************
 * Soriku IDE — engine client frontend DI module
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { PreferenceContribution } from '@theia/core/lib/common';
import { EngineClient } from '../common/engine-client';
import { EngineClientImpl } from './engine-client-impl';
import { sorikuEnginePreferenceSchema } from './soriku-engine-preferences';

export default new ContainerModule(bind => {
    bind(EngineClientImpl).toSelf().inSingletonScope();
    bind(EngineClient).toService(EngineClientImpl);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuEnginePreferenceSchema });
});
