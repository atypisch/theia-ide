/********************************************************************************
 * Soriku IDE — capability map frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuCapabilityMapWidget } from './soriku-capability-map-widget';
import { SorikuCapabilityMapContribution } from './soriku-capability-map-contribution';

export default new ContainerModule(bind => {
    bind(SorikuCapabilityMapWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuCapabilityMapWidget.ID,
        createWidget: () => ctx.container.get<SorikuCapabilityMapWidget>(SorikuCapabilityMapWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuCapabilityMapContribution);
});
