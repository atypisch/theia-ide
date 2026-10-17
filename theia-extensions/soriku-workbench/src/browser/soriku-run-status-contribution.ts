/********************************************************************************
 * Soriku IDE — status bar: "1 worker · 2 minions" and "✓ verified" (design status
 * bar). Both come from the chat's latest run via the shared run-state service and
 * are hidden when there is nothing real to show — never a placeholder.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { SorikuRunStateService } from 'soriku-engine-client-ext/lib/browser/soriku-run-state-service';
import { RunStateSnapshot, formatWorkerCounts } from 'soriku-engine-client-ext/lib/common/run-state';

const WORKERS_ID = 'soriku-run-workers-status';
const VERIFIED_ID = 'soriku-run-verified-status';
const SUBAGENT_LABEL_PREF = 'soriku.ui.subagentLabel';

@injectable()
export class SorikuRunStatusContribution implements FrontendApplicationContribution {

    @inject(SorikuRunStateService)
    protected readonly runState: SorikuRunStateService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    onStart(): void {
        this.runState.onDidChange(s => this.render(s));
        this.render(this.runState.get());
    }

    protected render(s: RunStateSnapshot): void {
        const label = (this.preferences.get<string>(SUBAGENT_LABEL_PREF, 'minions') ?? 'minions').trim() || 'minions';
        const counts = formatWorkerCounts(s, label);
        if (counts) {
            this.statusBar.setElement(WORKERS_ID, {
                text: counts,
                tooltip: s.running ? 'Agents working on the current run' : 'Agents in the latest run',
                alignment: StatusBarAlignment.LEFT,
                priority: 89,
                className: 'soriku-statusbar-workers',
            });
        } else {
            this.statusBar.removeElement(WORKERS_ID);
        }
        if (s.verified === 'none') {
            this.statusBar.removeElement(VERIFIED_ID);
            return;
        }
        const ok = s.verified === 'verified';
        this.statusBar.setElement(VERIFIED_ID, {
            text: ok ? '$(check) verified' : '$(warning) verify failed',
            tooltip: ok ? 'The latest run passed the engine\'s checks' : 'The latest run failed the engine\'s checks',
            alignment: StatusBarAlignment.RIGHT,
            priority: 0,
            className: ok ? 'soriku-statusbar-verified' : 'soriku-statusbar-verify-failed',
        });
    }
}
