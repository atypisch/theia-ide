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

    protected readonly onDidReviewWriteEmitter = new Emitter<{ accepted: boolean; path: string }>();
    /**
     * Fires when the user accepts or rejects a proposed agent write in the diff
     * review (Fase E). The chat widget turns this into implicit agent feedback —
     * accept = the code was good, reject = it wasn't — closing the learning loop
     * with zero extra effort. Decoupled so tools-bridge doesn't depend on chat.
     */
    readonly onDidReviewWrite: Event<{ accepted: boolean; path: string }> = this.onDidReviewWriteEmitter.event;

    /** Ask the chat widget to load this conversation (id) with its full context. */
    requestOpen(conversationId: string): void {
        this.onDidRequestOpenEmitter.fire(conversationId);
    }

    /** Notify listeners (e.g. the history panel) to reload from the engine. */
    notifyChanged(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    /** Report a diff-review decision so the chat can record implicit feedback. */
    notifyReviewWrite(accepted: boolean, path: string): void {
        this.onDidReviewWriteEmitter.fire({ accepted, path });
    }
}
