/********************************************************************************
 * Soriku IDE — "Soriku Engine" output channel: a readable log of what the engine
 * broadcasts on /api/events (plan, worker and review frames), in the Output panel
 * next to Terminal / Problems (design terminal panel tabs).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { SorikuPlanLiveBridge } from 'soriku-engine-client-ext/lib/browser/soriku-plan-live-bridge';
import { formatEngineLogLine } from 'soriku-engine-client-ext/lib/common/engine-log';

const CHANNEL_NAME = 'Soriku Engine';

@injectable()
export class SorikuEngineLogContribution implements FrontendApplicationContribution {

    @inject(OutputChannelManager)
    protected readonly outputChannels: OutputChannelManager;

    @inject(SorikuPlanLiveBridge)
    protected readonly bridge: SorikuPlanLiveBridge;

    onStart(): void {
        const channel = this.outputChannels.getChannel(CHANNEL_NAME);
        this.bridge.onDidReceiveRawEvent(data => {
            const line = formatEngineLogLine(data);
            if (line) {
                channel.appendLine(line);
            }
        });
    }
}
