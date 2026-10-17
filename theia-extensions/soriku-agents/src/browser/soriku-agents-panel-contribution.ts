/********************************************************************************
 * Soriku IDE — Agents panel lifecycle + toggle command (shows the titlebar button)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { SorikuAgentsPanelWidget } from './soriku-agents-panel-widget';

export namespace SorikuAgentsPanelCommands {
    /** The titlebar draws its toggle button only while this command exists. */
    export const TOGGLE: Command = { id: 'soriku.agentsPanel.toggle', category: 'Soriku', label: 'Toggle Agents Panel' };
}

@injectable()
export class SorikuAgentsPanelContribution implements CommandContribution {

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuAgentsPanelCommands.TOGGLE, { execute: () => this.toggle() });
    }

    protected async toggle(): Promise<void> {
        const existing = this.widgets.tryGetWidget(SorikuAgentsPanelWidget.ID);
        if (existing?.isAttached) {
            existing.close();
            return;
        }
        const widget = await this.widgets.getOrCreateWidget(SorikuAgentsPanelWidget.ID);
        // The right dock holds one widget (the chat), so the panel sits to the right of the editor instead.
        const ref = this.shell.getWidgets('main').find(w => w.id !== widget.id);
        await this.shell.addWidget(widget, ref ? { area: 'main', mode: 'split-right', ref } : { area: 'main' });
        await this.shell.activateWidget(widget.id);
    }
}
