/********************************************************************************
 * Soriku IDE — inserts the unified sidebar nav as a fixed column immediately
 * left of the existing left-panel dock, and hides its icon-rail tab bar
 * (our nav replaces it as the way to select Explorer/Search/SCM/etc).
 *
 * Reaches one level into ApplicationShell's internal split-layout (there is
 * no public "add a second independent left column" API in Theia) via the
 * documented Lumino Widget/Layout API — no @theia/core source is patched.
 * The panel id and structure are set in ApplicationShell#createLayout; if a
 * future Theia upgrade renames 'theia-left-right-split-panel', this
 * contribution degrades to a no-op (logged) rather than throwing.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { BoxLayout, SplitLayout, SplitPanel } from '@theia/core/shared/@lumino/widgets';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { SorikuSidebarWidget } from './soriku-sidebar-widget';
import { SorikuSidebarStateService } from './soriku-sidebar-state-service';

const SIDE_AREAS_PANEL_ID = 'theia-left-right-split-panel';

export namespace SorikuSidebarCommands {
    export const TOGGLE: Command = { id: 'soriku.sidebar.toggle', category: 'Soriku', label: 'Toggle Workspace Sidebar' };
    export const MINIMIZE: Command = { id: 'soriku.sidebar.minimize', category: 'Soriku', label: 'Minimize/Expand Workspace Sidebar' };
}

@injectable()
export class SorikuSidebarContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SorikuSidebarWidget)
    protected readonly sidebar: SorikuSidebarWidget;

    @inject(SorikuSidebarStateService)
    protected readonly sidebarState: SorikuSidebarStateService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuSidebarCommands.TOGGLE, { execute: () => this.toggle() });
        commands.registerCommand(SorikuSidebarCommands.MINIMIZE, { execute: () => this.sidebarState.toggleRail() });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({ command: SorikuSidebarCommands.TOGGLE.id, keybinding: 'ctrlcmd+b' });
    }

    protected toggle(): void {
        if (this.sidebar.isHidden) {
            this.sidebar.show();
        } else {
            this.sidebar.hide();
        }
    }

    onStart(): void {
        const outerLayout = this.shell.layout;
        if (!(outerLayout instanceof BoxLayout)) {
            console.warn('soriku-shell: ApplicationShell layout is not a BoxLayout; unified sidebar not inserted.');
            return;
        }
        const sideAreas = outerLayout.widgets.find(w => w.id === SIDE_AREAS_PANEL_ID);
        if (!sideAreas || !(sideAreas.layout instanceof SplitLayout)) {
            console.warn('soriku-shell: side-areas split panel not found; unified sidebar not inserted.');
            return;
        }
        SplitPanel.setStretch(this.sidebar, 0);
        sideAreas.layout.insertWidget(0, this.sidebar);

        // Hard-remove Theia's legacy left panel so its Explorer/Tree UI cannot
        // appear (especially when a persisted layout is restored in the
        // installed desktop app).
        //
        // We intentionally do NOT dispose() here: Theia's left-panel toggle
        // commands still reference the handler/container instance.
        try {
            const legacyLeft = this.shell.leftPanelHandler.container;
            sideAreas.layout.removeWidget(legacyLeft);
            legacyLeft.hide();
        } catch (e) {
            console.warn('soriku-shell: could not remove legacy left panel container', e);
        }

        // The icon-rail column itself is hidden via CSS (sidebar.css) rather
        // than a JS `.hide()` call — Theia's own layout-restore re-shows the
        // tab bar after onStart, which a one-time `.hide()` here can't survive.
    }
}
