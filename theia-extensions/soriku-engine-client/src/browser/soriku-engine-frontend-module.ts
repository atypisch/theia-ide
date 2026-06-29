/********************************************************************************
 * Soriku IDE — engine client frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { PreferenceContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EngineClient } from '../common/engine-client';
import { EngineClientImpl } from './engine-client-impl';
import { EngineAuthTokenHolder } from './engine-auth-token-holder';
import { SorikuModelCatalog } from './soriku-model-catalog';
import { SorikuConversationLink } from './soriku-conversation-link';
import { SorikuPlanLiveBridge } from './soriku-plan-live-bridge';
import { SorikuInlineCompletionContribution } from './soriku-inline-completion';
import { sorikuEnginePreferenceSchema } from './soriku-engine-preferences';

export default new ContainerModule(bind => {
    bind(EngineAuthTokenHolder).toSelf().inSingletonScope();
    bind(EngineClientImpl).toSelf().inSingletonScope();
    bind(EngineClient).toService(EngineClientImpl);
    bind(SorikuModelCatalog).toSelf().inSingletonScope();
    bind(SorikuConversationLink).toSelf().inSingletonScope();
    bind(SorikuPlanLiveBridge).toSelf().inSingletonScope();
    bind(SorikuInlineCompletionContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuInlineCompletionContribution);
    bind(PreferenceContribution).toConstantValue({ schema: sorikuEnginePreferenceSchema });
});
