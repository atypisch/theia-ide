/********************************************************************************
 * Soriku IDE — chat frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuChatWidget } from './soriku-chat-widget';
import { ChatStreamController } from './chat-stream-controller';
import { SorikuChatViewContribution } from './soriku-chat-view-contribution';

export default new ContainerModule(bind => {
    bind(ChatStreamController).toSelf().inSingletonScope();
    bind(SorikuChatWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuChatWidget.ID,
        createWidget: () => ctx.container.get<SorikuChatWidget>(SorikuChatWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuChatViewContribution);
    bind(FrontendApplicationContribution).toService(SorikuChatViewContribution);
});
