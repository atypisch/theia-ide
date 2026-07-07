/********************************************************************************
 * Soriku IDE — inserts the custom titlebar widget into the shell's top panel,
 * and registers the "Soriku: Toggle Theme" command (real command wrapping the
 * theme-toggle logic, so both the titlebar button and the menu bar/palette
 * can invoke the exact same thing).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { SORIKU_DARK_THEME_ID, SORIKU_LIGHT_THEME_ID } from 'soriku-theme-ext/lib/browser/soriku-theme-contribution';
import { SorikuTitlebarWidget } from './soriku-titlebar-widget';

export namespace SorikuTitlebarCommands {
    export const TOGGLE_THEME: Command = { id: 'soriku.theme.toggle', category: 'Soriku', label: 'Toggle Theme' };
}

@injectable()
export class SorikuTitlebarContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SorikuTitlebarWidget)
    protected readonly titlebar: SorikuTitlebarWidget;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    async onStart(): Promise<void> {
        await this.shell.addWidget(this.titlebar, { area: 'top' });
        this.shell.topPanel.setHidden(false);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SorikuTitlebarCommands.TOGGLE_THEME, {
            execute: () => {
                const current = this.themeService.getCurrentTheme().id;
                this.themeService.setCurrentTheme(current === SORIKU_DARK_THEME_ID ? SORIKU_LIGHT_THEME_ID : SORIKU_DARK_THEME_ID, true);
            },
        });
    }
}
