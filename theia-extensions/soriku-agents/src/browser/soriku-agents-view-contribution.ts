/********************************************************************************
 * Soriku IDE — agents view contribution (right side-bar)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { SorikuAgentsWidget } from './soriku-agents-widget';

export namespace SorikuAgentsCommands {
    export const TOGGLE = 'soriku.agents.toggle';
    export const REFRESH: Command = { id: 'soriku.agents.refresh', category: 'Soriku', label: 'Refresh Agents' };
}

@injectable()
export class SorikuAgentsViewContribution
    extends AbstractViewContribution<SorikuAgentsWidget>
    implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: SorikuAgentsWidget.ID,
            widgetName: SorikuAgentsWidget.LABEL,
            defaultWidgetOptions: { area: 'right', rank: 100 },
            toggleCommandId: SorikuAgentsCommands.TOGGLE,
        });
    }

    /** Open the panel on first start so agents are visible. Phase 3 owns the final default layout. */
    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false, reveal: true });
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
