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
import { environment } from '@theia/application-package/lib/environment';
import { Pill, SorikuMark } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuEngineStatusService } from 'soriku-workbench-ext/lib/browser/soriku-engine-status-service';
import { EngineConnectionState } from 'soriku-workbench-ext/lib/common/engine-status';
import { SORIKU_DARK_THEME_ID, SORIKU_LIGHT_THEME_ID } from 'soriku-theme-ext/lib/browser/soriku-theme-contribution';

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
        const current = this.themeService.getCurrentTheme().id;
        this.themeService.setCurrentTheme(current === SORIKU_DARK_THEME_ID ? SORIKU_LIGHT_THEME_ID : SORIKU_DARK_THEME_ID, true);
    };

    protected toggleLeftPanel = (): void => {
        this.commandService.executeCommand(CommonCommands.TOGGLE_LEFT_PANEL.id);
    };

    protected toggleBottomPanel = (): void => {
        this.commandService.executeCommand(CommonCommands.TOGGLE_BOTTOM_PANEL.id);
    };

    protected toggleRightPanel = (): void => {
        this.commandService.executeCommand(CommonCommands.TOGGLE_RIGHT_PANEL.id);
    };

    protected render(): React.ReactNode {
        const isDark = this.themeService.getCurrentTheme().id === SORIKU_DARK_THEME_ID;
        const state = this.engineStatus.getState();
        return (
            <div className="soriku-titlebar-row">
                <div className="soriku-titlebar-traffic-spacer">
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-close" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-min" />
                    <span className="soriku-titlebar-fake-dot soriku-titlebar-fake-dot-max" />
                </div>
                <SorikuMark size={18} className="soriku-titlebar-logo" />
                <span className="soriku-titlebar-word">
                    Soriku <span className="soriku-titlebar-word-accent">Code</span>
                </span>
                <span className="soriku-titlebar-breadcrumb">{this.windowTitleService.title}</span>
                <div className="soriku-titlebar-spacer" />
                <Pill tone={engineTone(state.status)}>
                    <span className="soriku-titlebar-dot" />
                    {engineText(state)}
                </Pill>
                <button className="soriku-titlebar-icon-btn" title="Toggle theme" onClick={this.toggleTheme}>
                    <span className="codicon codicon-color-mode" />
                    {isDark ? 'Dark' : 'Light'}
                </button>
                <button className="soriku-titlebar-icon-btn" title="Toggle Sidebar" onClick={this.toggleLeftPanel}>
                    <span className="codicon codicon-layout-sidebar-left" />
                </button>
                <button className="soriku-titlebar-icon-btn" title="Toggle Panel" onClick={this.toggleBottomPanel}>
                    <span className="codicon codicon-layout-panel" />
                </button>
                <button className="soriku-titlebar-icon-btn" title="Toggle Chat" onClick={this.toggleRightPanel}>
                    <span className="codicon codicon-layout-sidebar-right" />
                </button>
            </div>
        );
    }
}
