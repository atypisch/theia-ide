/********************************************************************************
 * Soriku IDE — MCP servers frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuMcpWidget } from './soriku-mcp-widget';
import { SorikuMcpContribution } from './soriku-mcp-contribution';

export default new ContainerModule(bind => {
    bind(SorikuMcpWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuMcpWidget.ID,
        createWidget: () => ctx.container.get<SorikuMcpWidget>(SorikuMcpWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuMcpContribution);
});
