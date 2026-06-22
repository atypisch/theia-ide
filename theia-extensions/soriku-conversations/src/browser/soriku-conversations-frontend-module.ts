/********************************************************************************
 * Soriku IDE — conversations frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuConversationsWidget } from './soriku-conversations-widget';
import { SorikuConversationsViewContribution } from './soriku-conversations-view-contribution';

export default new ContainerModule(bind => {
    bind(SorikuConversationsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuConversationsWidget.ID,
        createWidget: () => ctx.container.get<SorikuConversationsWidget>(SorikuConversationsWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuConversationsViewContribution);
});
