/********************************************************************************
 * Soriku IDE — conversations view contribution (command + right side-bar)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuConversationsWidget } from './soriku-conversations-widget';

export namespace SorikuConversationsCommands {
    export const OPEN = 'soriku.conversations.open';
    export const REFRESH: Command = { id: 'soriku.conversations.refresh', category: 'Soriku', label: 'Refresh Conversations' };
    export const MANAGE: Command = { id: SorikuConversationsCommands.OPEN, category: 'Soriku', label: 'Conversations' };
}

@injectable()
export class SorikuConversationsViewContribution extends AbstractViewContribution<SorikuConversationsWidget> {

    constructor() {
        super({
            widgetId: SorikuConversationsWidget.ID,
            widgetName: SorikuConversationsWidget.LABEL,
            defaultWidgetOptions: { area: 'right', rank: 250 },
            toggleCommandId: SorikuConversationsCommands.OPEN,
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuConversationsCommands.REFRESH, {
            execute: async () => {
                const widget = await this.widget;
                await widget.refresh();
            },
        });
    }
}
