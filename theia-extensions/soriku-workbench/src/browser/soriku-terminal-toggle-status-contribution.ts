/********************************************************************************
 * Soriku IDE — status-bar Terminal toggle, 1:1 from the mockup (icon +
 * "Terminal" text, line 903 of Soriku IDE.dc.html). Theia's own stock
 * "bottom-panel-toggle" status item is icon-only (a generic window glyph,
 * no text) and is hidden via CSS (statusbar.css) — this reuses its real
 * command (core.toggle.bottom.panel) rather than adding new toggle logic.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';

const SORIKU_TERMINAL_TOGGLE_STATUS_ID = 'soriku-terminal-toggle-status';

@injectable()
export class SorikuTerminalToggleStatusContribution implements FrontendApplicationContribution {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(): void {
        this.statusBar.setElement(SORIKU_TERMINAL_TOGGLE_STATUS_ID, {
            text: '$(terminal) Terminal',
            tooltip: 'Toggle Terminal',
            alignment: StatusBarAlignment.RIGHT,
            command: 'core.toggle.bottom.panel',
            priority: 50,
        });
    }
}
