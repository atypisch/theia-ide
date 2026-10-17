/********************************************************************************
 * Soriku IDE — status bar: whether project instructions (soriku.md) are in effect.
 * "soriku.md ✓" = approved and sent with requests; "⚠ soriku.md" = needs your review.
 * Hidden when the project has none.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { SorikuProjectInstructionsService, InstructionsState } from 'soriku-tools-bridge-ext/lib/browser/soriku-project-instructions-service';
import { SorikuInstructionsCommands } from 'soriku-tools-bridge-ext/lib/browser/soriku-project-instructions-contribution';

const STATUS_ID = 'soriku-instructions-status';

@injectable()
export class SorikuInstructionsStatusContribution implements FrontendApplicationContribution {

    @inject(SorikuProjectInstructionsService)
    protected readonly instructions: SorikuProjectInstructionsService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(): void {
        this.instructions.onDidChange(s => this.render(s));
        this.render(this.instructions.getState());
    }

    protected render(s: InstructionsState): void {
        if (s.status === 'none') {
            this.statusBar.removeElement(STATUS_ID);
            return;
        }
        const review = s.status === 'review';
        this.statusBar.setElement(STATUS_ID, {
            text: review ? '$(warning) soriku.md' : '$(check) soriku.md',
            tooltip: review ? 'Project instructions are new or changed — click to review' : `Project instructions in effect (${s.files.join(', ')})`,
            alignment: StatusBarAlignment.LEFT,
            priority: 88,
            command: review ? SorikuInstructionsCommands.OPEN.id : undefined,
            className: review ? 'soriku-statusbar-verify-failed' : 'soriku-statusbar-workers',
        });
    }
}
