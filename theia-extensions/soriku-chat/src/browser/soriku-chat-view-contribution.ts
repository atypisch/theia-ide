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

/** v2 design: the chat dock is 420px wide by default (resizable 360–720). */
const DEFAULT_CHAT_WIDTH = 420;

export namespace SorikuChatCommands {
    /** Toggle visibility of the chat panel (Cmd/Ctrl+L keybinding is bound in Phase 3). */
    export const TOGGLE = 'soriku.chat.toggle';
    /** Open the chat for a given agent id (invoked by the agents panel's "Open chat"). */
    export const OPEN: Command = { id: 'soriku.chat.open', category: 'Soriku', label: 'Open Chat' };
    /** Invoked by the Agents panel (args: {planId, workerId}). */
    export const SUBAGENT_INSIGHT: Command = { id: 'soriku.chat.subagent.insight' };
    /** Invoked by the Agents panel (args: {planId, parentAgentId}). */
    export const SUBAGENT_SPAWN: Command = { id: 'soriku.chat.subagent.spawn' };
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
    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false, reveal: true });
        app.shell.resize(DEFAULT_CHAT_WIDTH, 'right');
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
        commands.registerCommand(SorikuChatCommands.SUBAGENT_INSIGHT, {
            execute: (arg?: { planId?: string; workerId?: string }) => {
                if (arg?.planId && arg.workerId) { this.tryGetWidget()?.openSubagentInsightFor(arg.planId, arg.workerId); }
            },
        });
        commands.registerCommand(SorikuChatCommands.SUBAGENT_SPAWN, {
            execute: (arg?: { planId?: string; parentAgentId?: string }) => {
                if (arg?.planId && arg.parentAgentId) { this.tryGetWidget()?.openSpawnSubagentFor(arg.planId, arg.parentAgentId); }
            },
        });
    }
}
