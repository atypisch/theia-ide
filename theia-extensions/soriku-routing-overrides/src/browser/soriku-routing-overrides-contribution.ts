/********************************************************************************
 * Soriku IDE — routing overrides view contribution
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuRoutingOverridesWidget } from './soriku-routing-overrides-widget';

export namespace SorikuRoutingOverridesCommands {
    export const OPEN: Command = { id: 'soriku.routing.overrides.open', category: 'Soriku', label: 'Routing Overrides' };
}

@injectable()
export class SorikuRoutingOverridesContribution extends AbstractViewContribution<SorikuRoutingOverridesWidget> {

    constructor() {
        super({
            widgetId: SorikuRoutingOverridesWidget.ID,
            widgetName: SorikuRoutingOverridesWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuRoutingOverridesCommands.OPEN, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }
}
