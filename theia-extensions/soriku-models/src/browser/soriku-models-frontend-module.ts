/********************************************************************************
 * Soriku IDE — models frontend DI module
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuModelsWidget } from './soriku-models-widget';
import { SorikuModelsViewContribution } from './soriku-models-view-contribution';

export default new ContainerModule(bind => {
    bind(SorikuModelsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SorikuModelsWidget.ID,
        createWidget: () => ctx.container.get<SorikuModelsWidget>(SorikuModelsWidget),
    })).inSingletonScope();

    bindViewContribution(bind, SorikuModelsViewContribution);
});
