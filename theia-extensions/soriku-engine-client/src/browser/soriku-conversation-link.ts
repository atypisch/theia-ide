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

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires when the engine conversation store may have changed (new message, rename, delete). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Ask the chat widget to load this conversation (id) with its full context. */
    requestOpen(conversationId: string): void {
        this.onDidRequestOpenEmitter.fire(conversationId);
    }

    /** Notify listeners (e.g. the history panel) to reload from the engine. */
    notifyChanged(): void {
        this.onDidChangeEmitter.fire(undefined);
    }
}
