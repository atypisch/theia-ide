/********************************************************************************
 * Soriku IDE — models view contribution (command + right side-bar)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuModelsWidget } from './soriku-models-widget';

export namespace SorikuModelsCommands {
    export const OPEN = 'soriku.models.open';
    export const REFRESH: Command = { id: 'soriku.models.refresh', category: 'Soriku', label: 'Refresh Models' };
    export const MANAGE: Command = { id: SorikuModelsCommands.OPEN, category: 'Soriku', label: 'Manage Models' };
}

@injectable()
export class SorikuModelsViewContribution extends AbstractViewContribution<SorikuModelsWidget> {

    constructor() {
        super({
            widgetId: SorikuModelsWidget.ID,
            widgetName: SorikuModelsWidget.LABEL,
            defaultWidgetOptions: { area: 'right', rank: 300 },
            toggleCommandId: SorikuModelsCommands.OPEN,
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuModelsCommands.REFRESH, {
            execute: async () => {
                const widget = await this.widget;
                await widget.refresh();
            },
        });
    }
}
