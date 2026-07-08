/********************************************************************************
 * Soriku IDE — remove remaining Theia legacy chrome (menubar + right tabs)
 * so the UI matches the Soriku mockup 1:1.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';

const THEIA_MENU_BAR_WIDGET_ID = 'theia:menubar';
const THEIA_ICON_WIDGET_ID = 'theia:icon';

// Keep the Soriku chat widget only (avoid importing the chat extension here).
const SORIKU_CHAT_WIDGET_ID = 'soriku-chat';

@injectable()
export class SorikuLegacyCleanupContribution implements FrontendApplicationContribution {
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    async onStart(): Promise<void> {
        // Layout-restore + view contributions can add/remove widgets after onStart,
        // so we retry a couple times to ensure legacy never becomes visible.
        const delays = [0, 50, 200, 500];
        delays.forEach((delay, idx) => {
            window.setTimeout(() => this.cleanupOnce(idx), delay);
        });
    }

    protected cleanupOnce(_runIndex: number): void {
        this.cleanupTopPanel();
        this.cleanupRightDockPanel();
    }

    protected cleanupTopPanel(): void {
        // The stock BrowserMenuBarContribution adds a logo widget (theia:icon)
        // and the in-window menu bar (theia:menubar).
        for (const widget of [...this.shell.topPanel.widgets]) {
            if (widget.id === THEIA_MENU_BAR_WIDGET_ID || widget.id === THEIA_ICON_WIDGET_ID) {
                try {
                    if (!widget.isDisposed) {
                        widget.hide();
                        const disposable = widget as { dispose?: () => void };
                        disposable.dispose?.();
                    }
                } catch (e) {
                    console.warn(`Failed to hide legacy widget ${widget.id}:`, e);
                }
            }
        }
    }

    protected cleanupRightDockPanel(): void {
        const dockPanel = this.shell.rightPanelHandler.dockPanel;
        const widgets = [...dockPanel.widgets()];
        for (const widget of widgets) {
            if (widget.id === SORIKU_CHAT_WIDGET_ID) {
                continue;
            }
            try {
                if (!widget.isDisposed) {
                    widget.hide();
                    const disposable = widget as { dispose?: () => void };
                    disposable.dispose?.();
                }
            } catch (e) {
                console.warn(`Failed to hide non-chat widget ${widget.id}:`, e);
            }
        }
    }
}

