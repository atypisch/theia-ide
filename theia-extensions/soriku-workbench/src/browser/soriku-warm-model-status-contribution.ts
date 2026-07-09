/********************************************************************************
 * Soriku IDE — warm-model status bar item, 1:1 from the mockup's status bar
 * (real data only: fetched from listInstalledModels() whenever the engine
 * connects, refreshed on every reconnect; hidden entirely when no model is
 * currently warm rather than showing a fabricated placeholder).
 *
 * The mockup's status bar also shows a live "1 worker · 2 minions" count and
 * a "verified ✓" checkmark — both are scoped to an active chat session's
 * Fleet state, which is chat-widget-local (see soriku-chat-widget.tsx's
 * AgentActivity list) with no shared global service exposing it app-wide.
 * Deliberately omitted here rather than wiring a new cross-extension event
 * bus just for a status bar decoration — same precedent as the Agents
 * grid's omitted "New agent" button.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { EngineConnectionState } from '../common/engine-status';
import { SorikuEngineStatusService } from './soriku-engine-status-service';

const SORIKU_WARM_MODEL_STATUS_ID = 'soriku-warm-model-status';
const SORIKU_WARM_MODEL_TAG_STATUS_ID = 'soriku-warm-model-tag-status';

@injectable()
export class SorikuWarmModelStatusContribution implements FrontendApplicationContribution {

    @inject(SorikuEngineStatusService)
    protected readonly engineStatus: SorikuEngineStatusService;

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(): void {
        this.engineStatus.onDidChangeState(state => this.onEngineStateChanged(state));
        this.onEngineStateChanged(this.engineStatus.getState());
    }

    protected onEngineStateChanged(state: EngineConnectionState): void {
        if (state.status !== 'connected') {
            this.remove();
            return;
        }
        this.refresh();
    }

    protected remove(): void {
        this.statusBar.removeElement(SORIKU_WARM_MODEL_STATUS_ID);
        this.statusBar.removeElement(SORIKU_WARM_MODEL_TAG_STATUS_ID);
    }

    protected async refresh(): Promise<void> {
        try {
            const res = await this.engineClient.listInstalledModels();
            const warm = (res.models ?? []).find(m => m.is_running);
            if (!warm) {
                this.remove();
                return;
            }
            const tooltip = `${warm.name ?? warm.id} is warm and ready`;
            // Two adjacent compact-left/compact-right entries render as one
            // mockup block ("modelid warm") with independent colors — a single
            // StatusBarEntry can only carry one color for its whole text.
            this.statusBar.setElement(SORIKU_WARM_MODEL_STATUS_ID, {
                text: warm.id,
                tooltip,
                alignment: StatusBarAlignment.LEFT,
                priority: 91,
                className: 'soriku-statusbar-model compact-left',
            });
            this.statusBar.setElement(SORIKU_WARM_MODEL_TAG_STATUS_ID, {
                text: 'warm',
                tooltip,
                alignment: StatusBarAlignment.LEFT,
                priority: 90,
                className: 'soriku-statusbar-model-tag compact-right',
            });
        } catch {
            this.remove();
        }
    }
}
