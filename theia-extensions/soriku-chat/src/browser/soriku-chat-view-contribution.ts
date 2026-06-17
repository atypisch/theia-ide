/********************************************************************************
 * Soriku IDE — chat view contribution (right side-bar)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuChatWidget } from './soriku-chat-widget';

export namespace SorikuChatCommands {
    /** Toggle visibility of the chat panel (Cmd/Ctrl+L keybinding is bound in Phase 3). */
    export const TOGGLE = 'soriku.chat.toggle';
    /** Open the chat for a given agent id (invoked by the agents panel's "Open chat"). */
    export const OPEN: Command = { id: 'soriku.chat.open', category: 'Soriku', label: 'Open Chat' };
}

@injectable()
export class SorikuChatViewContribution
    extends AbstractViewContribution<SorikuChatWidget>
    implements FrontendApplicationContribution {

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

    /** Open the chat panel on first start (next to Agents). Phase 3 owns the final default layout. */
    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false, reveal: true });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuChatCommands.OPEN, {
            execute: (agentId?: string) => {
                // Only set selection if this is a different agent — the agents panel
                // already calls setActive(id, name) before invoking this command, and
                // passing no name here would clobber the stored display name.
                if (typeof agentId === 'string' && agentId !== this.selection.getActiveId()) {
                    this.selection.setActive(agentId);
                }
                return this.openView({ activate: true, reveal: true });
            },
        });
    }
}
