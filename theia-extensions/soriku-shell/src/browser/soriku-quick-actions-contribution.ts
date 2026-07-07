/********************************************************************************
 * Soriku IDE — "Soriku: Quick Actions" curated quick-pick, matching the
 * mockup's 9-item, colour-coded command-palette content. This is additional
 * to (not a replacement for) Theia's own full command palette
 * (workbench.action.showCommands): that one stays fully functional so
 * fuzzy-searching/running any real command and go-to-file both keep
 * working. Colouring every real command to match a static mockup would mean
 * either fabricating colours for commands the mockup never specified, or
 * cutting the palette down to 9 items and losing real functionality —
 * neither is acceptable, so this curated list lives alongside it instead.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser';

export namespace SorikuQuickActionsCommands {
    export const OPEN: Command = { id: 'soriku.quickActions.open', category: 'Soriku', label: 'Quick Actions' };
}

interface QuickActionItem extends QuickPickItem {
    commandId: string;
}

@injectable()
export class SorikuQuickActionsContribution implements CommandContribution {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    protected items(): QuickActionItem[] {
        return [
            { label: 'Go to Explorer', commandId: 'workbench.view.explorer', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-accent'] },
            { label: 'Open Agents', commandId: 'soriku.agents.toggle', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-code'] },
            { label: 'Manage Models', commandId: 'soriku.models.open', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-reason'] },
            { label: 'Open Capability Map', commandId: 'soriku.capabilityMap.open', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-general'] },
            { label: 'MCP Servers', commandId: 'soriku.mcp.open', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-accent'] },
            { label: 'Routing Overrides', commandId: 'soriku.routing.overrides.open', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-reason'] },
            { label: 'Toggle Terminal', commandId: 'workbench.action.terminal.toggleTerminal', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-neutral'] },
            { label: 'Toggle Theme', commandId: 'soriku.theme.toggle', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-neutral'] },
            { label: 'Open Settings', commandId: 'preferences:open', iconClasses: ['soriku-qp-icon', 'soriku-qp-icon-neutral'] },
        ];
    }

    protected async open(): Promise<void> {
        const items = this.items().filter(item => this.commands.getCommand(item.commandId));
        const pick = await this.quickInput.showQuickPick(items, { placeholder: 'Go to view or run a command…' });
        if (pick) {
            await this.commands.executeCommand((pick as QuickActionItem).commandId);
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuQuickActionsCommands.OPEN, { execute: () => this.open() });
    }
}
