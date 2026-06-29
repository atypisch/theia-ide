/********************************************************************************
 * Soriku IDE — MCP servers view contribution
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuMcpWidget } from './soriku-mcp-widget';

export namespace SorikuMcpCommands {
    export const OPEN: Command = { id: 'soriku.mcp.open', category: 'Soriku', label: 'MCP Servers' };
}

@injectable()
export class SorikuMcpContribution extends AbstractViewContribution<SorikuMcpWidget> {

    constructor() {
        super({
            widgetId: SorikuMcpWidget.ID,
            widgetName: SorikuMcpWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuMcpCommands.OPEN, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }
}
