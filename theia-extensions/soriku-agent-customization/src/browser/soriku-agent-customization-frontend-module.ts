/********************************************************************************
 * Soriku IDE — agent customization frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuAgentEditWidget } from './soriku-agent-edit-widget';
import { SorikuAgentEditContribution } from './soriku-agent-edit-contribution';

export default new ContainerModule(bind => {
    bind(SorikuAgentEditWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuAgentEditWidget.ID,
        createWidget: () => ctx.container.get<SorikuAgentEditWidget>(SorikuAgentEditWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuAgentEditContribution);
});
