/********************************************************************************
 * Soriku IDE — chat frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';
import '../../src/browser/style/chat-v2.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuChatWidget } from './soriku-chat-widget';
import { ChatStreamController } from './chat-stream-controller';
import { ChatSessionService } from './chat-session-service';
import { SorikuChatViewContribution } from './soriku-chat-view-contribution';
import { SorikuPlanDocService } from './soriku-plan-doc-service';
import { SorikuPlanDocWidget } from './soriku-plan-doc-widget';

export default new ContainerModule(bind => {
    bind(ChatStreamController).toSelf().inSingletonScope();
    bind(ChatSessionService).toSelf().inSingletonScope();
    bind(SorikuPlanDocService).toSelf().inSingletonScope();
    bind(SorikuPlanDocWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuPlanDocWidget.ID,
        createWidget: () => ctx.container.get<SorikuPlanDocWidget>(SorikuPlanDocWidget),
    })).inSingletonScope();
    bind(SorikuChatWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuChatWidget.ID,
        createWidget: () => ctx.container.get<SorikuChatWidget>(SorikuChatWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuChatViewContribution);
    bind(FrontendApplicationContribution).toService(SorikuChatViewContribution);
});
