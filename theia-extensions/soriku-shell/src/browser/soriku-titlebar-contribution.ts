/********************************************************************************
 * Soriku IDE — inserts the custom titlebar widget into the shell's top panel
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { SorikuTitlebarWidget } from './soriku-titlebar-widget';

@injectable()
export class SorikuTitlebarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SorikuTitlebarWidget)
    protected readonly titlebar: SorikuTitlebarWidget;

    async onStart(): Promise<void> {
        await this.shell.addWidget(this.titlebar, { area: 'top' });
        this.shell.topPanel.setHidden(false);
    }
}
