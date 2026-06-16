/********************************************************************************
 * Soriku IDE — agent edit view contribution
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuAgentEditWidget } from './soriku-agent-edit-widget';

export namespace SorikuAgentEditCommands {
    /** Invoked by the agents panel's "Edit" button with an agent id. */
    export const EDIT: Command = { id: 'soriku.agents.edit', category: 'Soriku', label: 'Edit Agent' };
}

@injectable()
export class SorikuAgentEditContribution extends AbstractViewContribution<SorikuAgentEditWidget> {

    constructor() {
        super({
            widgetId: SorikuAgentEditWidget.ID,
            widgetName: SorikuAgentEditWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuAgentEditCommands.EDIT, {
            execute: async (agentId?: string) => {
                const widget = await this.widget;
                if (typeof agentId === 'string') {
                    await widget.loadAgent(agentId);
                }
                await this.openView({ activate: true, reveal: true });
            },
        });
    }
}
