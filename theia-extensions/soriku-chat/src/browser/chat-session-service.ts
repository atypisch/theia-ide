/********************************************************************************
 * Soriku IDE — chat session service (P4-b)
 *
 * Owns the conversation STATE that used to live as mutable fields inside the
 * chat widget: the message list, conversation identity, feedback, persistence
 * across reloads, and the external-plan follow/ingest flow. The widget renders
 * what this service holds and subscribes to onDidChange — state mutations from
 * multiple flows (send-stream, external plan broadcasts, restore) now go through
 * ONE owner, which is what made the #15/#16 bug class possible to begin with.
 *
 * UI concerns stay out: agent selection is passed in as values, user-facing
 * notifications go through MessageService, re-rendering is the widget's reaction
 * to onDidChange.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event, MessageService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { SorikuSseEvent } from 'soriku-engine-client-ext/lib/common/engine-types';
import { AssistantTurn, ChatMessage, createAssistantTurn, fromEngineMessages, reduceSseEvent } from '../common/chat-model';
import { ChatStreamController } from './chat-stream-controller';

/** Persisted (across reloads) pointer to the chat the user was last in. */
export const ACTIVE_CHAT_STORAGE_KEY = 'soriku.chat.active';

export interface ActiveChatState {
    conversationId: string;
    agentId?: string;
    agentName?: string;
}

@injectable()
export class ChatSessionService {

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(ChatStreamController)
    protected readonly streamController: ChatStreamController;

    conversation: ChatMessage[] = [];
    conversationId: string | undefined;
    conversationTitle?: string;
    readonly feedbackByTurn = new Map<string, 'positive' | 'negative'>();

    protected idSeq = 0;
    /** Live follow of an engine plan started outside this widget (CLI/API). */
    protected externalFollowConvId?: string;
    protected externalTurnIndex = -1;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires when session state changed from a non-widget flow (restore, external plan). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    nextId(): string {
        return `m${++this.idSeq}`;
    }

    /** Persist the active-conversation pointer (best-effort). */
    persistActiveChat(agentId?: string, agentName?: string): void {
        if (!this.conversationId) {
            return;
        }
        const state: ActiveChatState = { conversationId: this.conversationId, agentId, agentName };
        this.storage.setData(ACTIVE_CHAT_STORAGE_KEY, state).catch(() => { /* best-effort */ });
    }

    /** The stored active-chat pointer, if any (the widget applies agent selection). */
    async restoreActiveChat(): Promise<ActiveChatState | undefined> {
        try {
            return await this.storage.getData<ActiveChatState | undefined>(ACTIVE_CHAT_STORAGE_KEY, undefined);
        } catch {
            return undefined;
        }
    }

    /**
     * Load a stored conversation into the session. Returns the conversation's
     * persona id (engine is the source of truth) so the caller can select it.
     */
    async loadConversation(id: string): Promise<string | undefined> {
        const conv = await this.engineClient.getConversation(id);
        this.conversation = fromEngineMessages(conv.messages ?? []);
        this.conversationId = conv.id;
        this.conversationTitle = conv.title;
        this.feedbackByTurn.clear();
        this.conversationLink.notifyChanged();
        return conv.persona_id as string | undefined;
    }

    /** Start fresh (new chat / agent switch): clears state + the stored pointer. */
    reset(): void {
        this.conversation = [];
        this.feedbackByTurn.clear();
        this.conversationId = undefined;
        this.conversationTitle = undefined;
        this.externalFollowConvId = undefined;
        this.externalTurnIndex = -1;
        this.storage.setData(ACTIVE_CHAT_STORAGE_KEY, undefined).catch(() => { /* best-effort */ });
    }

    /**
     * Fold a broadcast plan event into the followed conversation. `onLiveActivity`
     * is the widget's side-effect hook (editor reveal). No-op while a local stream
     * is active — the send flow owns the conversation then.
     */
    async ingestLivePlanEvent(event: SorikuSseEvent, onLiveActivity: (event: SorikuSseEvent) => void,
        persistWith?: { agentId?: string; agentName?: string }): Promise<void> {
        if (this.streamController.active) {
            return;
        }
        const convId = typeof event.conversation_id === 'string' ? event.conversation_id : undefined;
        if (convId && convId !== this.externalFollowConvId) {
            await this.followExternalPlan(convId, persistWith);
        }
        if (this.externalTurnIndex < 0) {
            return;
        }
        const current = this.conversation[this.externalTurnIndex];
        if (!current || current.role !== 'assistant') {
            return;
        }
        let turn = reduceSseEvent(current, event);
        if (event.type === 'plan_done' || event.type === 'plan_failed' || event.type === 'plan_cancelled') {
            turn = { ...turn, status: event.type === 'plan_done' ? 'done' : 'error' };
            this.externalFollowConvId = undefined;
            this.externalTurnIndex = -1;
        } else {
            turn = { ...turn, status: 'streaming' };
        }
        this.conversation[this.externalTurnIndex] = turn;
        onLiveActivity(event);
        this.conversationLink.notifyChanged();
        this.onDidChangeEmitter.fire();
    }

    /** Attach to a plan conversation broadcast from the engine (CLI/API runs). */
    protected async followExternalPlan(convId: string, persistWith?: { agentId?: string; agentName?: string }): Promise<void> {
        // #15: never wholesale-replace an UNSAVED local chat with the external plan's
        // conversation — that silently wiped it. Only hijack an empty widget, the same
        // conversation, or a persisted one (reloadable from the engine).
        const unsavedLocalChat = this.conversationId === undefined && this.conversation.length > 0;
        if (unsavedLocalChat) {
            this.messages.info('Live plan gestart in een andere conversatie — open die via Conversations om mee te kijken (je huidige chat blijft staan).');
            return;
        }
        this.externalFollowConvId = convId;
        try {
            const conv = await this.engineClient.getConversation(convId);
            this.conversation = fromEngineMessages(conv.messages ?? []);
            this.conversationId = conv.id;
            this.conversationTitle = conv.title;
            let idx = this.conversation.length - 1;
            if (idx < 0 || this.conversation[idx].role !== 'assistant') {
                const turn = createAssistantTurn(this.nextId());
                turn.status = 'streaming';
                turn.phase = 'Plan running…';
                idx = this.conversation.push(turn) - 1;
            } else {
                const last = this.conversation[idx] as AssistantTurn;
                this.conversation[idx] = { ...last, status: 'streaming', phase: last.phase ?? 'Plan running…' };
            }
            this.externalTurnIndex = idx;
            this.persistActiveChat(persistWith?.agentId, persistWith?.agentName);
            this.conversationLink.requestOpen(convId);
            this.messages.info('Live plan gestart — je ziet file writes hier en in de editor.');
        } catch (e) {
            this.messages.error(`Kon plan-conversatie niet openen: ${(e as Error).message}`);
        }
    }
}
