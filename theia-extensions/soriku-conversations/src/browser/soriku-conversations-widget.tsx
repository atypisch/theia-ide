/********************************************************************************
 * Soriku IDE — conversation history panel (list / preview / open in chat /
 * rename / delete). Selecting a row fetches its real messages/project
 * context into the right-hand pane (a deliberate extension beyond the
 * mockup's static empty-state demo); "Open in Chat" remains the separate
 * action that loads a conversation into the live Chat view.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/lib/browser/widgets/widget';
import { CommandService, Disposable, MessageService } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/browser';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { ConversationDetail, ConversationSummary } from 'soriku-engine-client-ext/lib/common/engine-types';
import { Btn, SorikuMark } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuToastService } from 'soriku-theme-ext/lib/browser/soriku-toast-service';
import { cleanTitle, conversationInitials, modeFromTitle, projectLabel, relativeAge, roleLabel } from '../common/conversation-view';

/** Chat view command (registered by soriku-chat) used to reveal the chat. */
const SORIKU_CHAT_OPEN = 'soriku.chat.open';

@injectable()
export class SorikuConversationsWidget extends ReactWidget {

    static readonly ID = 'soriku-conversations';
    static readonly LABEL = 'Soriku Conversations';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuConversationLink)
    protected readonly link: SorikuConversationLink;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(SorikuToastService)
    protected readonly toast: SorikuToastService;

    protected items: ConversationSummary[] = [];
    protected loading = true;
    protected error?: string;
    protected busyIds = new Set<string>();
    protected activeConversationId?: string;
    protected refreshRetryTimer: number | undefined;

    /**
     * Conversation currently previewed in the right-hand pane (distinct from
     * activeConversationId, which tracks what's loaded into the Chat view).
     */
    protected selectedId?: string;
    protected detail?: ConversationDetail;
    protected detailLoading = false;
    protected detailError?: string;

    @postConstruct()
    protected init(): void {
        this.id = SorikuConversationsWidget.ID;
        this.title.label = SorikuConversationsWidget.LABEL;
        this.title.caption = SorikuConversationsWidget.LABEL;
        this.title.iconClass = 'codicon codicon-history';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-conversations-widget');
        this.toDispose.push(this.link.onDidChange(() => this.refresh()));
        this.toDispose.push(this.link.onDidRequestOpen(id => { this.activeConversationId = id; this.update(); }));
        // #18: a pending 3s refresh-retry must not fire on a disposed widget.
        this.toDispose.push(Disposable.create(() => {
            if (this.refreshRetryTimer !== undefined) {
                clearTimeout(this.refreshRetryTimer);
                this.refreshRetryTimer = undefined;
            }
        }));
        this.update();
        this.refresh();
    }

    override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.refresh();
    }

    protected scheduleRefreshRetry(): void {
        if (this.refreshRetryTimer !== undefined) {
            return;
        }
        this.refreshRetryTimer = window.setTimeout(() => {
            this.refreshRetryTimer = undefined;
            this.refresh();
        }, 3000);
    }

    async refresh(): Promise<void> {
        this.loading = true;
        this.error = undefined;
        this.update();
        try {
            this.items = await this.engineClient.listConversations();
            this.error = undefined;
        } catch (e) {
            this.error = (e as Error).message;
            if (this.items.length === 0) {
                this.scheduleRefreshRetry();
            }
        }
        this.loading = false;
        this.update();
    }

    /** Preview a conversation's real messages/project context in the right pane. */
    protected select(item: ConversationSummary): void {
        this.selectedId = item.id;
        this.detail = undefined;
        this.detailError = undefined;
        this.update();
        this.loadDetail(item.id);
    }

    protected async loadDetail(id: string): Promise<void> {
        this.detailLoading = true;
        this.update();
        try {
            const detail = await this.engineClient.getConversation(id);
            // The user may have already selected a different row while this was in flight.
            if (this.selectedId === id) {
                this.detail = detail;
            }
        } catch (e) {
            if (this.selectedId === id) {
                this.detailError = (e as Error).message;
            }
        } finally {
            if (this.selectedId === id) {
                this.detailLoading = false;
                this.update();
            }
        }
    }

    /** Reveal the chat and load this conversation (the chat widget owns the load). */
    protected async open(item: ConversationSummary): Promise<void> {
        try {
            await this.commands.executeCommand(SORIKU_CHAT_OPEN);
        } catch {
            /* chat view may already be open */
        }
        this.link.requestOpen(item.id);
    }

    protected async rename(item: ConversationSummary): Promise<void> {
        const title = await this.quickInput.input({
            title: 'Rename conversation',
            value: item.title,
            prompt: 'New title',
        });
        if (!title || !title.trim()) {
            return;
        }
        this.busyIds.add(item.id);
        this.update();
        try {
            await this.engineClient.renameConversation(item.id, title.trim());
            await this.refresh();
            this.toast.show(`Renamed to "${title.trim()}"`);
        } catch (e) {
            this.messages.error(`Could not rename: ${(e as Error).message}`);
        } finally {
            this.busyIds.delete(item.id);
            this.update();
        }
    }

    protected async remove(item: ConversationSummary): Promise<void> {
        const ok = await new ConfirmDialog({
            title: 'Delete conversation',
            msg: `Delete "${cleanTitle(item.title)}"? This cannot be undone.`,
            ok: 'Delete',
            cancel: 'Cancel',
        }).open();
        if (ok !== true) {
            return;
        }
        this.busyIds.add(item.id);
        this.update();
        try {
            await this.engineClient.deleteConversation(item.id);
            await this.refresh();
            this.toast.show(`Deleted "${cleanTitle(item.title)}"`);
        } catch (e) {
            this.messages.error(`Could not delete: ${(e as Error).message}`);
        } finally {
            this.busyIds.delete(item.id);
            this.update();
        }
    }

    protected render(): React.ReactNode {
        return <div className='soriku-conversations'>
            <div className='soriku-conversations-list-pane'>
                <div className='soriku-conversations-header'>
                    <div className='soriku-conversations-eyebrow'><span className='soriku-conversations-eyebrow-dot' />History</div>
                    <div className='soriku-conversations-heading'>Your <span className='sk-em'>chats</span></div>
                </div>
                {this.renderList()}
            </div>
            {this.selectedId ? this.renderDetail() : <div className='soriku-conversations-empty-pane'>
                <SorikuMark size={46} className='soriku-conversations-empty-mark' />
                <span>Open a conversation to continue</span>
            </div>}
        </div>;
    }

    protected renderDetail(): React.ReactNode {
        const item = this.items.find(i => i.id === this.selectedId);
        if (this.detailError) {
            return <div className='soriku-conversations-detail-pane'>
                <div className='soriku-conversations-detail-error'>
                    {this.detailError}
                    <Btn variant='secondary' onClick={() => this.selectedId && this.loadDetail(this.selectedId)}>Retry</Btn>
                </div>
            </div>;
        }
        if (this.detailLoading && !this.detail) {
            return <div className='soriku-conversations-detail-pane'>
                <div className='soriku-conversations-meta'>Loading…</div>
            </div>;
        }
        if (!this.detail) {
            return <div className='soriku-conversations-detail-pane' />;
        }
        const project = projectLabel(this.detail.project_id);
        return <div className='soriku-conversations-detail-pane'>
            <div className='soriku-conversations-detail-header'>
                <div className='soriku-conversations-detail-title'>{cleanTitle(this.detail.title)}</div>
                {(project || item) && <div className='soriku-conversations-detail-meta'>
                    {[project, item && `${item.message_count} msg`].filter(Boolean).join(' · ')}
                </div>}
            </div>
            <div className='soriku-conversations-detail-messages sk-scroll'>
                {this.detail.messages.length === 0
                    ? <div className='soriku-conversations-meta'>No messages in this conversation.</div>
                    : this.detail.messages.map((m, i) => <div key={i} className={`soriku-conversations-detail-message soriku-conversations-detail-message-${m.role}`}>
                        <span className='soriku-conversations-detail-message-role'>{roleLabel(m.role)}</span>
                        <span className='soriku-conversations-detail-message-content'>{m.content}</span>
                    </div>)}
            </div>
        </div>;
    }

    protected renderList(): React.ReactNode {
        const now = Date.now();
        return <div className='soriku-conversations-list sk-scroll'>
            {this.error && <div className='soriku-conversations-error'>
                {this.error}
                <Btn variant='secondary' disabled={this.loading} onClick={() => this.refresh()}>Retry</Btn>
            </div>}
            {this.loading && this.items.length === 0
                ? <div className='soriku-conversations-meta'>Loading…</div>
                : <ul className='soriku-conversations-rows'>
                    {this.items.map(item => {
                        const busy = this.busyIds.has(item.id);
                        const mode = modeFromTitle(item.title);
                        const project = projectLabel(item.project_id);
                        const active = item.id === this.activeConversationId || item.id === this.selectedId;
                        return <li key={item.id} className={`soriku-conversations-row${active ? ' active' : ''}`}>
                            <button className='soriku-conversations-open' title='Preview conversation' disabled={busy}
                                onClick={() => this.select(item)}>
                                <span className='soriku-conversations-avatar'>{conversationInitials(item.persona_id, item.title)}</span>
                                <span className='soriku-conversations-row-body'>
                                    <span className='soriku-conversations-row-head'>
                                        <span className='soriku-conversations-name'>
                                            {mode && <span className='soriku-conversations-mode'>{mode}</span>}
                                            {cleanTitle(item.title)}
                                        </span>
                                        <span className='soriku-conversations-time'>{relativeAge(item.created_at, now)}</span>
                                    </span>
                                    <span className='soriku-conversations-meta'>
                                        {[`${item.message_count} msg`, project].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                            </button>
                            <button className='soriku-iconbtn' title='Open in Chat' disabled={busy} onClick={() => this.open(item)}>
                                <span className='codicon codicon-comment-discussion' />
                            </button>
                            <button className='soriku-iconbtn' title='Rename' disabled={busy} onClick={() => this.rename(item)}>
                                <span className='codicon codicon-edit' />
                            </button>
                            <button className='soriku-iconbtn' title='Delete' disabled={busy} onClick={() => this.remove(item)}>
                                <span className='codicon codicon-trash' />
                            </button>
                        </li>;
                    })}
                    {this.items.length === 0 && <li className='soriku-conversations-meta'>No conversations yet.</li>}
                </ul>}
        </div>;
    }
}
