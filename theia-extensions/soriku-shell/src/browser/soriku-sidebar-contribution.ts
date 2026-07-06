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
import { SorikuSidebarWidget } from './soriku-sidebar-widget';

const SIDE_AREAS_PANEL_ID = 'theia-left-right-split-panel';

@injectable()
export class SorikuSidebarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SorikuSidebarWidget)
    protected readonly sidebar: SorikuSidebarWidget;

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
        // The icon-rail column itself is hidden via CSS (sidebar.css) rather
        // than a JS `.hide()` call — Theia's own layout-restore re-shows the
        // tab bar after onStart, which a one-time `.hide()` here can't survive.
    }
}
