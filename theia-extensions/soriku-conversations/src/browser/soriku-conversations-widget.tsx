/********************************************************************************
 * Soriku IDE — conversation history panel (list / open / rename / delete)
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
import { ConversationSummary } from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuMark } from 'soriku-theme-ext/lib/browser/ui';
import { cleanTitle, conversationInitials, modeFromTitle, projectLabel, relativeAge } from '../common/conversation-view';

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

    protected items: ConversationSummary[] = [];
    protected loading = true;
    protected error?: string;
    protected busyIds = new Set<string>();
    protected activeConversationId?: string;
    protected refreshRetryTimer: number | undefined;

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
            <div className='soriku-conversations-empty-pane'>
                <SorikuMark size={46} className='soriku-conversations-empty-mark' />
                <span>Open a conversation to continue</span>
            </div>
        </div>;
    }

    protected renderList(): React.ReactNode {
        const now = Date.now();
        return <div className='soriku-conversations-list sk-scroll'>
            {this.error && <div className='soriku-conversations-error'>
                {this.error}
                <button className='theia-button secondary' disabled={this.loading} onClick={() => this.refresh()}>Retry</button>
            </div>}
            {this.loading && this.items.length === 0
                ? <div className='soriku-conversations-meta'>Loading…</div>
                : <ul className='soriku-conversations-rows'>
                    {this.items.map(item => {
                        const busy = this.busyIds.has(item.id);
                        const mode = modeFromTitle(item.title);
                        const project = projectLabel(item.project_id);
                        const active = item.id === this.activeConversationId;
                        return <li key={item.id} className={`soriku-conversations-row${active ? ' active' : ''}`}>
                            <button className='soriku-conversations-open' title='Open conversation' disabled={busy}
                                onClick={() => this.open(item)}>
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
