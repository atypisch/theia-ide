/********************************************************************************
 * Soriku IDE — tool confirmation service
 *
 * Listens (via the chat stream) for engine `confirm_tool` requests, shows a
 * default-deny confirmation dialog, and posts the decision to the engine.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { describeToolConfirmation, parseConfirmToolEvent } from '../common/tool-confirmation';

@injectable()
export class SorikuToolConfirmationService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    /**
     * Handle a single `confirm_tool` event: ask the user (default deny) and report the decision to
     * the engine, which then runs or skips the tool server-side. Safe to call fire-and-forget; the
     * engine blocks until /api/worker/confirm arrives, so the chat stream resumes after this resolves.
     */
    async confirm(event: SorikuSseEvent): Promise<boolean> {
        const request = parseConfirmToolEvent(event);
        if (!request) {
            return false;
        }
        const view = describeToolConfirmation(request);
        let approved = false;
        try {
            const dialog = new ConfirmDialog({
                title: view.title,
                msg: this.renderMessage(view.message),
                ok: 'Allow once',
                cancel: 'Deny',
            });
            approved = (await dialog.open()) === true;
        } catch {
            approved = false; // default deny on any dialog failure
        }
        await this.engineClient.confirmTool({
            confirmation_id: request.confirmationId,
            approved,
            remember: '',
        });
        return approved;
    }

    protected renderMessage(message: string): HTMLElement {
        const node = document.createElement('div');
        node.style.whiteSpace = 'pre-wrap';
        node.style.maxWidth = '480px';
        node.textContent = message;
        return node;
    }
}
