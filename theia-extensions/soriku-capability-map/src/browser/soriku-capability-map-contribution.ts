/********************************************************************************
 * Soriku IDE — capability map view contribution (opens in the main area)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuCapabilityMapWidget } from './soriku-capability-map-widget';

export namespace SorikuCapabilityMapCommands {
    export const OPEN: Command = { id: 'soriku.capabilityMap.open', category: 'Soriku', label: 'Open Capability Map' };
}

@injectable()
export class SorikuCapabilityMapContribution extends AbstractViewContribution<SorikuCapabilityMapWidget> {

    constructor() {
        super({
            widgetId: SorikuCapabilityMapWidget.ID,
            widgetName: SorikuCapabilityMapWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(SorikuCapabilityMapCommands.OPEN, {
            execute: () => this.openView({ activate: true, reveal: true }),
        });
    }
}
