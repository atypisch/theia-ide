/********************************************************************************
 * Soriku IDE — custom titlebar (logo, menu, command palette, engine mode
 * pill, sidebar/chat/theme toggles), 1:1 from the mockup's titlebar row.
 * No window-title text — the mockup's titlebar carries no filename; the
 * active file stays visible via the editor tab + breadcrumb row instead.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService } from '@theia/core/lib/common/command';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { environment } from '@theia/application-package/lib/environment';
import { SorikuLogo } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuEngineStatusService } from 'soriku-workbench-ext/lib/browser/soriku-engine-status-service';
import { EngineConnectionState } from 'soriku-workbench-ext/lib/common/engine-status';
import { SorikuTitlebarMenu } from './soriku-titlebar-menu';
import { SorikuSidebarWidget } from './soriku-sidebar-widget';
import { SorikuSidebarCommands } from './soriku-sidebar-contribution';

const COMMAND_PALETTE_COMMAND_ID = 'workbench.action.showCommands';

/** Kept in sync with SorikuTitlebarCommands.TOGGLE_THEME in soriku-titlebar-contribution.ts. */
const TOGGLE_THEME_COMMAND_ID = 'soriku.theme.toggle';

/** "Local mode" / "Hosted" / "Engine unreachable" / "Not connected", per the mockup's mode pill. */
function engineText(state: EngineConnectionState): string {
    const local = /^(127\.0\.0\.1|localhost)/.test(state.baseUrl.replace(/^https?:\/\//, ''));
    const scope = local ? 'Local mode' : 'Hosted';
    if (state.status === 'connected') {
        return scope;
    }
    if (state.status === 'connecting') {
        return `${scope} · connecting…`;
    }
    if (state.status === 'unreachable') {
        return 'Engine unreachable';
    }
    return 'Not connected';
}

function engineTone(status: EngineConnectionState['status']): 'ok' | 'warn' | 'danger' | 'default' {
    if (status === 'connected') {
        return 'ok';
    }
    if (status === 'connecting') {
        return 'warn';
    }
    if (status === 'unreachable') {
        return 'danger';
    }
    return 'default';
}

@injectable()
export class SorikuTitlebarWidget extends ReactWidget {

    static readonly ID = 'soriku-titlebar';

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(SorikuSidebarWidget)
    protected readonly sidebar: SorikuSidebarWidget;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @postConstruct()
    protected init(): void {
        this.id = SorikuTitlebarWidget.ID;
        this.addClass('soriku-titlebar');
        if (!environment.electron.is()) {
            this.addClass('soriku-titlebar-fake-controls');
        }
        this.update();
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.update()));
        this.toDispose.push(this.engineStatus.onDidChangeState(() => this.update()));
        // Neither the sidebar's hidden/shown state (until the rail state
        // service lands) nor collapsePanel/expandPanel('right') fire a
        // dedicated event we can subscribe to — re-render on every command
        // execution and filter for the two that can change either icon's
        // active state, so both these buttons and their keybindings/menu
        // items keep the icons in sync regardless of trigger source.
        this.toDispose.push(this.commandService.onDidExecuteCommand(e => {
            if (e.commandId === SorikuSidebarCommands.TOGGLE.id || e.commandId === CommonCommands.TOGGLE_RIGHT_PANEL.id) {
                this.update();
            }
        }));
    }

    protected toggleTheme = (): void => {
        this.commandService.executeCommand(TOGGLE_THEME_COMMAND_ID);
    };

    protected toggleRightPanel = (): void => {
        this.commandService.executeCommand(CommonCommands.TOGGLE_RIGHT_PANEL.id);
    };

    protected toggleSidebar = (): void => {
        this.commandService.executeCommand(SorikuSidebarCommands.TOGGLE.id);
    };

    protected openCommandPalette = (): void => {
        this.commandService.executeCommand(COMMAND_PALETTE_COMMAND_ID);
    };

    protected keybindingFor = (commandId: string): string | undefined => {
        const kb = this.keybindings.getKeybindingsForCommand(commandId)[0];
        if (!kb) {
            return undefined;
        }
        return this.keybindings.acceleratorFor(kb).join(' ');
    };

    protected render(): React.ReactNode {
        const state = this.engineStatus.getState();
        const tone = engineTone(state.status);
        const sidebarVisible = !this.sidebar.isHidden;
        const chatVisible = this.shell.isExpanded('right');
        return (
            <div className="soriku-titlebar-row">
                <div className="soriku-titlebar-traffic-spacer">
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-close" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-min" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-max" />
                </div>
                <SorikuLogo height={18} className="soriku-titlebar-logo" />
                <div className="soriku-titlebar-separator" />
                <SorikuTitlebarMenu keybindingFor={this.keybindingFor} executeCommand={id => this.commandService.executeCommand(id)} />
                <div className="soriku-titlebar-spacer" />
                <button className="soriku-titlebar-palette-trigger" onClick={this.openCommandPalette}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M7 9l3 3-3 3M13 15h4" />
                    </svg>
                    <span className="soriku-titlebar-palette-trigger-text">Run a command or go to file…</span>
                    <span className="soriku-titlebar-palette-trigger-hint">{this.keybindingFor(COMMAND_PALETTE_COMMAND_ID)}</span>
                </button>
                <div className="soriku-titlebar-spacer" />
                <div className={`soriku-titlebar-mode-pill soriku-titlebar-mode-pill-${tone}`}>
                    <span className="soriku-titlebar-mode-pill-dot" />
                    {engineText(state)}
                </div>
                <button
                    className={`soriku-titlebar-icon-btn2${sidebarVisible ? ' active' : ''}`}
                    title="Toggle sidebar"
                    onClick={this.toggleSidebar}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
                <button
                    className={`soriku-titlebar-icon-btn2${chatVisible ? ' active' : ''}`}
                    title="Toggle chat"
                    onClick={this.toggleRightPanel}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </button>
                <button className="soriku-titlebar-icon-btn2" title="Toggle theme" onClick={this.toggleTheme}>
                    <span className="soriku-titlebar-theme-glyph" />
                </button>
            </div>
        );
    }
}
