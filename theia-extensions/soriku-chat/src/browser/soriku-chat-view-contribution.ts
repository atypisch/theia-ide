/********************************************************************************
 * Soriku IDE — chat view contribution (right side-bar)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuChatWidget } from './soriku-chat-widget';

export namespace SorikuChatCommands {
    /** Toggle visibility of the chat panel (Cmd/Ctrl+L keybinding is bound in Phase 3). */
    export const TOGGLE = 'soriku.chat.toggle';
    /** Open the chat for a given agent id (invoked by the agents panel's "Open chat"). */
    export const OPEN: Command = { id: 'soriku.chat.open', category: 'Soriku', label: 'Open Chat' };
}

@injectable()
export class SorikuChatViewContribution extends AbstractViewContribution<SorikuChatWidget> {

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    constructor() {
        super({
            widgetId: SorikuChatWidget.ID,
            widgetName: SorikuChatWidget.LABEL,
            defaultWidgetOptions: { area: 'right', rank: 200 },
            toggleCommandId: SorikuChatCommands.TOGGLE,
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuChatCommands.OPEN, {
            execute: (agentId?: string) => {
                if (typeof agentId === 'string') {
                    this.selection.setActive(agentId);
                }
                return this.openView({ activate: true, reveal: true });
            },
        });
    }
}
