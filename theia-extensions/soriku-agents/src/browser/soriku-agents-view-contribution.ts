/********************************************************************************
 * Soriku IDE — agents view contribution (full-page main-area view)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuAgentsWidget } from './soriku-agents-widget';

export namespace SorikuAgentsCommands {
    export const TOGGLE = 'soriku.agents.toggle';
    export const REFRESH: Command = { id: 'soriku.agents.refresh', category: 'Soriku', label: 'Refresh Agents' };
}

@injectable()
export class SorikuAgentsViewContribution extends AbstractViewContribution<SorikuAgentsWidget> {

    constructor() {
        super({
            widgetId: SorikuAgentsWidget.ID,
            widgetName: SorikuAgentsWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
            toggleCommandId: SorikuAgentsCommands.TOGGLE,
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuAgentsCommands.REFRESH, {
            execute: async () => {
                const widget = await this.widget;
                await widget.refresh();
            },
        });
    }
}
