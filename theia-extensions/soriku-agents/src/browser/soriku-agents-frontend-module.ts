/********************************************************************************
 * Soriku IDE — agents frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { CommandContribution, PreferenceContribution } from '@theia/core/lib/common';
import { SorikuAgentSelectionService } from './soriku-agent-selection';
import { SorikuAgentCatalog, SorikuAgentPrefetch } from './soriku-agent-catalog';
import { SorikuDefaultAgentResolver } from './soriku-default-agent-resolver';
import { sorikuAgentsPreferenceSchema } from './soriku-agents-preferences';
import { SorikuAgentsWidget } from './soriku-agents-widget';
import { SorikuAgentsViewContribution } from './soriku-agents-view-contribution';
import { SorikuNewAgentContribution } from './soriku-new-agent-contribution';

export default new ContainerModule(bind => {
    bind(SorikuAgentSelectionService).toSelf().inSingletonScope();
    bind(SorikuAgentCatalog).toSelf().inSingletonScope();
    bind(SorikuAgentPrefetch).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SorikuAgentPrefetch);
    bind(SorikuDefaultAgentResolver).toSelf().inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: sorikuAgentsPreferenceSchema });

    bind(SorikuAgentsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuAgentsWidget.ID,
        createWidget: () => ctx.container.get<SorikuAgentsWidget>(SorikuAgentsWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuAgentsViewContribution);
    bind(FrontendApplicationContribution).toService(SorikuAgentsViewContribution);

    bind(SorikuNewAgentContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SorikuNewAgentContribution);
});
