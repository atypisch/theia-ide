/********************************************************************************
 * Soriku IDE — conversation open requests
 *
 * A tiny shared bus so the Conversations history panel can ask the chat widget
 * to load a stored conversation, without a hard dependency between the two
 * extensions (mirrors SorikuModelCatalog).
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common';

@injectable()
export class SorikuConversationLink {

    protected readonly onDidRequestOpenEmitter = new Emitter<string>();
    /** Fires with a conversation id when the user opens one from the history panel. */
    readonly onDidRequestOpen: Event<string> = this.onDidRequestOpenEmitter.event;

    /** Ask the chat widget to load this conversation (id) with its full context. */
    requestOpen(conversationId: string): void {
        this.onDidRequestOpenEmitter.fire(conversationId);
    }
}
