/********************************************************************************
 * Soriku IDE — routing overrides frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuRoutingOverridesWidget } from './soriku-routing-overrides-widget';
import { SorikuRoutingOverridesContribution } from './soriku-routing-overrides-contribution';

export default new ContainerModule(bind => {
    bind(SorikuRoutingOverridesWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuRoutingOverridesWidget.ID,
        createWidget: () => ctx.container.get<SorikuRoutingOverridesWidget>(SorikuRoutingOverridesWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuRoutingOverridesContribution);
});
