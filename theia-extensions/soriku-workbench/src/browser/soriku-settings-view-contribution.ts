/********************************************************************************
 * Soriku IDE — settings view contribution (full-page main-area view)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Command } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { SorikuSettingsWidget } from './soriku-settings-widget';

export namespace SorikuSettingsCommands {
    export const OPEN = 'soriku.settings.open';
    export const MANAGE: Command = { id: SorikuSettingsCommands.OPEN, category: 'Soriku', label: 'Settings' };
}

@injectable()
export class SorikuSettingsViewContribution extends AbstractViewContribution<SorikuSettingsWidget> {

    constructor() {
        super({
            widgetId: SorikuSettingsWidget.ID,
            widgetName: SorikuSettingsWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
            toggleCommandId: SorikuSettingsCommands.OPEN,
        });
    }
}
