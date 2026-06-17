/********************************************************************************
 * Soriku IDE — agent chat widget (SSE streaming, model transparency)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuToolConfirmationService } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-confirmation-service';
import {
    AssistantTurn,
    ChatMessage,
    ChatToolCall,
    createAssistantTurn,
    reduceSseEvent,
} from '../common/chat-model';

@injectable()
export class SorikuChatWidget extends ReactWidget {

    static readonly ID = 'soriku-chat';
    static readonly LABEL = 'Soriku Chat';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(SorikuToolConfirmationService)
    protected readonly toolConfirmation: SorikuToolConfirmationService;

    protected conversation: ChatMessage[] = [];
    protected feedbackByTurn = new Map<string, 'positive' | 'negative'>();
    protected conversationId: string | undefined;
    protected streaming = false;
    protected idSeq = 0;
    protected abortController: AbortController | undefined;
    protected inputRef = React.createRef<HTMLTextAreaElement>();

    @postConstruct()
    protected init(): void {
        this.id = SorikuChatWidget.ID;
        this.title.label = SorikuChatWidget.LABEL;
        this.title.caption = SorikuChatWidget.LABEL;
        this.title.iconClass = 'codicon codicon-comment-discussion';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('soriku-chat-widget');
        this.toDispose.push(this.selection.onDidChangeActive(() => this.onAgentChanged()));
        this.update();
    }

    /** Switching the active agent starts a fresh conversation (no cross-agent history). */
    protected onAgentChanged(): void {
        this.abortController?.abort();
        this.conversation = [];
        this.feedbackByTurn.clear();
        this.conversationId = undefined;
        this.streaming = false;
        this.update();
    }

    protected nextId(): string {
        return `m${++this.idSeq}`;
    }

    protected submitFromInput(): void {
        const textarea = this.inputRef.current;
        if (!textarea) {
            return;
        }
        const text = textarea.value;
        if (text.trim()) {
            textarea.value = '';
            this.send(text.trim()).catch(() => { /* errors are captured into the assistant turn */ });
        }
    }

    async send(text: string): Promise<void> {
        const agentId = this.selection.getActiveId();
        if (!agentId) {
            this.messages.info('Select an agent in the Soriku Agents panel first.');
            return;
        }
        if (this.streaming) {
            return;
        }
        this.conversation.push({ role: 'user', id: this.nextId(), text });
        let turn = createAssistantTurn(this.nextId());
        const turnIndex = this.conversation.push(turn) - 1;
        this.streaming = true;
        this.abortController = new AbortController();
        this.update();
        try {
            const stream = this.engineClient.chatStream(
                {
                    prompt: text,
                    personaId: agentId,
                    conversationId: this.conversationId,
                    useWorker: true,
                    clientTools: this.toolConfirmation.delegatedTools(),
                },
                this.abortController.signal,
            );
            for await (const event of stream) {
                turn = reduceSseEvent(turn, event);
                this.conversation[turnIndex] = turn;
                if (turn.conversationId) {
                    this.conversationId = turn.conversationId;
                }
                if (event.type === 'confirm_tool') {
                    // Fire-and-forget: the engine blocks until /api/worker/confirm, then the stream
                    // resumes. Awaiting here would deadlock the loop waiting for the next event.
                    this.toolConfirmation.confirm(event).catch(() => { /* default-deny already posted */ });
                } else if (event.type === 'tool_request') {
                    // Delegated tool: run it against the workspace, then POST the result. Same
                    // fire-and-forget reasoning — the engine blocks until the result arrives.
                    this.toolConfirmation.executeDelegated(event).catch(() => { /* error result already posted */ });
                }
                this.update();
            }
            if (turn.status === 'streaming') {
                turn = { ...turn, status: 'done' };
                this.conversation[turnIndex] = turn;
            }
        } catch (e) {
            turn = { ...turn, status: 'error', error: (e as Error).message };
            this.conversation[turnIndex] = turn;
        } finally {
            this.streaming = false;
            this.abortController = undefined;
            this.update();
        }
    }

    protected stop(): void {
        this.abortController?.abort();
    }

    /** Send thumbs feedback for an assistant turn to the engine (positive/negative). */
    protected async submitFeedback(turn: AssistantTurn, rating: 'positive' | 'negative'): Promise<void> {
        const agentId = this.selection.getActiveId();
        if (!agentId) {
            return;
        }
        const index = this.conversation.findIndex(m => m === turn);
        const prior = index > 0 ? this.conversation[index - 1] : undefined;
        const input = prior && prior.role === 'user' ? prior.text : '';
        this.feedbackByTurn.set(turn.id, rating);
        this.update();
        try {
            await this.engineClient.sendAgentFeedback(agentId, { rating, input, output: turn.text });
        } catch (e) {
            this.feedbackByTurn.delete(turn.id);
            this.messages.error(`Could not send feedback: ${(e as Error).message}`);
            this.update();
        }
    }

    protected render(): React.ReactNode {
        const agentId = this.selection.getActiveId();
        return <div className='soriku-chat'>
            <div className='soriku-chat-header'>
                {agentId
                    ? <span>Agent: <span className='soriku-chat-agent'>{agentId}</span></span>
                    : <span className='soriku-chat-noagent'>No agent selected — pick one in the Agents panel.</span>}
            </div>
            <div className='soriku-chat-messages'>
                {this.conversation.length === 0
                    ? <div className='soriku-chat-empty'>Ask the agent a question to start.</div>
                    : this.conversation.map(message => this.renderMessage(message))}
            </div>
            <div className='soriku-chat-input'>
                <textarea
                    ref={this.inputRef}
                    className='theia-input'
                    rows={3}
                    placeholder={agentId ? 'Message the agent…  (Enter to send, Shift+Enter for newline)' : 'Select an agent first'}
                    disabled={!agentId}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            this.submitFromInput();
                        }
                    }}
                />
                <div className='soriku-chat-actions'>
                    {this.streaming
                        ? <button className='theia-button secondary' onClick={() => this.stop()}>Stop</button>
                        : <button className='theia-button' disabled={!agentId} onClick={() => this.submitFromInput()}>Send</button>}
                </div>
            </div>
        </div>;
    }

    protected renderMessage(message: ChatMessage): React.ReactNode {
        if (message.role === 'user') {
            return <div key={message.id} className='soriku-msg soriku-msg-user'>
                <div className='soriku-msg-text'>{message.text}</div>
            </div>;
        }
        return this.renderAssistant(message);
    }

    protected renderAssistant(turn: AssistantTurn): React.ReactNode {
        return <div key={turn.id} className='soriku-msg soriku-msg-assistant'>
            <div className='soriku-msg-meta'>
                {turn.respondedBy && <span className='soriku-msg-agent'>{turn.respondedBy}</span>}
                {turn.model && <span className='soriku-msg-model' title='Model that produced this answer'>{turn.model}</span>}
                {turn.status === 'streaming' && <span className='soriku-msg-typing'>…</span>}
            </div>
            {turn.text && <div className='soriku-msg-text'>{turn.text}</div>}
            {turn.toolCalls.map((call, i) => this.renderToolCall(turn.id, call, i))}
            {turn.status === 'error' && <div className='soriku-msg-error'>{turn.error}</div>}
            {turn.status === 'done' && turn.text && this.renderFeedback(turn)}
        </div>;
    }

    protected renderFeedback(turn: AssistantTurn): React.ReactNode {
        const current = this.feedbackByTurn.get(turn.id);
        return <div className='soriku-msg-feedback'>
            <button
                className={`soriku-feedback-btn${current === 'positive' ? ' active' : ''}`}
                title='Good response'
                onClick={() => this.submitFeedback(turn, 'positive')}
            ><span className='codicon codicon-thumbsup' /></button>
            <button
                className={`soriku-feedback-btn${current === 'negative' ? ' active' : ''}`}
                title='Bad response'
                onClick={() => this.submitFeedback(turn, 'negative')}
            ><span className='codicon codicon-thumbsdown' /></button>
        </div>;
    }

    protected renderToolCall(turnId: string, call: ChatToolCall, index: number): React.ReactNode {
        return <details key={`${turnId}-tool-${index}`} className='soriku-tool-call'>
            <summary>
                <span className='codicon codicon-tools' /> {call.tool}
                <span className={`soriku-tool-status ${call.status}`}>{call.status}</span>
            </summary>
            <pre className='soriku-tool-detail'>{JSON.stringify({ args: call.args, result: call.result }, undefined, 2)}</pre>
        </details>;
    }
}
