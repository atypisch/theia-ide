/********************************************************************************
 * Soriku IDE — custom titlebar (logo, window title, engine pill, theme
 * toggle, layout toggles), 1:1 from the mockup's titlebar row.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService } from '@theia/core/lib/common/command';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { environment } from '@theia/application-package/lib/environment';
import { Pill, SorikuLogo } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuEngineStatusService } from 'soriku-workbench-ext/lib/browser/soriku-engine-status-service';
import { EngineConnectionState } from 'soriku-workbench-ext/lib/common/engine-status';
import { SorikuTitlebarMenu } from './soriku-titlebar-menu';

const COMMAND_PALETTE_COMMAND_ID = 'workbench.action.showCommands';

/** Kept in sync with SorikuTitlebarCommands.TOGGLE_THEME in soriku-titlebar-contribution.ts. */
const TOGGLE_THEME_COMMAND_ID = 'soriku.theme.toggle';

/** "Local mode · connected" / "Hosted · connecting…" / "Engine unreachable", per the mockup pill. */
function engineText(state: EngineConnectionState): string {
    const local = /^(127\.0\.0\.1|localhost)/.test(state.baseUrl.replace(/^https?:\/\//, ''));
    const scope = local ? 'Local mode' : 'Hosted';
    if (state.status === 'connected') {
        return `${scope} · connected`;
    }
    if (state.status === 'connecting') {
        return `${scope} · connecting…`;
    }
    if (state.status === 'unreachable') {
        return 'Engine unreachable';
    }
    return `${scope} · not connected`;
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

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @postConstruct()
    protected init(): void {
        this.id = SorikuTitlebarWidget.ID;
        this.addClass('soriku-titlebar');
        if (!environment.electron.is()) {
            this.addClass('soriku-titlebar-fake-controls');
        }
        this.update();
        this.toDispose.push(this.windowTitleService.onDidChangeTitle(() => this.update()));
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.update()));
        this.toDispose.push(this.engineStatus.onDidChangeState(() => this.update()));
    }

    protected toggleTheme = (): void => {
        this.commandService.executeCommand(TOGGLE_THEME_COMMAND_ID);
    };

    protected toggleRightPanel = (): void => {
        this.commandService.executeCommand(CommonCommands.TOGGLE_RIGHT_PANEL.id);
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
        return (
            <div className="soriku-titlebar-row">
                <div className="soriku-titlebar-traffic-spacer">
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-close" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-min" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-max" />
                </div>
                <SorikuLogo height={19} className="soriku-titlebar-logo" />
                <span className="soriku-titlebar-word">
                    <span className="soriku-titlebar-word-accent">Code</span>
                </span>
                <SorikuTitlebarMenu keybindingFor={this.keybindingFor} executeCommand={id => this.commandService.executeCommand(id)} />
                <span className="soriku-titlebar-breadcrumb">{this.windowTitleService.title}</span>
                <div className="soriku-titlebar-spacer" />
                <button className="soriku-titlebar-palette-trigger" onClick={this.openCommandPalette}>
                    <span className="codicon codicon-search" />
                    <span className="soriku-titlebar-palette-trigger-text">Run a command or go to file…</span>
                    <span className="soriku-titlebar-palette-trigger-hint">{this.keybindingFor(COMMAND_PALETTE_COMMAND_ID)}</span>
                </button>
                <div className="soriku-titlebar-spacer" />
                <Pill tone={engineTone(state.status)}>
                    <span className="soriku-titlebar-dot" />
                    {engineText(state)}
                </Pill>
                <button className="soriku-titlebar-icon-btn" title="Toggle Chat" onClick={this.toggleRightPanel}>
                    <span className="codicon codicon-layout-sidebar-right" />
                </button>
                <button className="soriku-titlebar-icon-btn" title="Toggle theme" onClick={this.toggleTheme}>
                    <span className="codicon codicon-color-mode" />
                </button>
            </div>
        );
    }
}
