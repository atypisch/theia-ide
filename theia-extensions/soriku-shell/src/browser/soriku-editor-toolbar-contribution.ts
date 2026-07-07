/********************************************************************************
 * Soriku IDE — adds a maximize icon-button to the main editor area's own
 * tab-bar toolbar, matching the mockup's tab-bar maximize control.
 *
 * Theia's own "core.toggleMaximized" command is wrapped in a
 * CurrentWidgetCommandAdapter whose handler expects a raw DOM Event as its
 * argument (it resolves the target tab/widget via shell.findTabBar(event)) —
 * but TabBarToolbarItem invokes commands with the Widget itself, not an
 * Event (see @theia/core's tab-toolbar-item.tsx). Pointing this button
 * straight at "core.toggleMaximized" is therefore a silent no-op: the
 * adapter can't resolve a tab bar from a Widget, so its title-based guard
 * never passes. This registers a thin wrapper command that calls the same
 * real ApplicationShell.toggleMaximized(widget) with the argument shape the
 * toolbar actually provides — no new maximize logic, just a correctly
 * shaped adapter for this one call site.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { Widget } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export const SORIKU_TOGGLE_MAXIMIZED: Command = {
    id: 'soriku.editor.toggleMaximized',
    category: 'Soriku',
    label: CommonCommands.TOGGLE_MAXIMIZED.label,
};

@injectable()
export class SorikuEditorToolbarContribution implements TabBarToolbarContribution, CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SORIKU_TOGGLE_MAXIMIZED, {
            execute: (widget?: Widget) => widget && this.shell.toggleMaximized(widget),
            isVisible: (widget?: Widget) => !!widget && this.shell.getAreaFor(widget) === 'main',
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: SORIKU_TOGGLE_MAXIMIZED.id,
            command: SORIKU_TOGGLE_MAXIMIZED.id,
            icon: 'codicon codicon-screen-full',
            tooltip: CommonCommands.TOGGLE_MAXIMIZED.label,
            priority: 100,
            isVisible: (widget?: Widget) => !!widget && this.shell.getAreaFor(widget) === 'main',
        });
    }
}
