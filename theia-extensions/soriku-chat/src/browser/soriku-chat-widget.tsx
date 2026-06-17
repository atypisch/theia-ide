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
import { ChatMode, V1ModelDescriptor } from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuToolConfirmationService } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-confirmation-service';
import {
    AssistantTurn,
    ChatMessage,
    ChatToolCall,
    busyPhase,
    createAssistantTurn,
    reduceSseEvent,
} from '../common/chat-model';

/** Orchestration choices surfaced in the chat — mapped to engine ChatRequest.mode. */
interface OrchestrationOption {
    mode: ChatMode;
    label: string;
    hint: string;
}

const ORCHESTRATION_OPTIONS: OrchestrationOption[] = [
    { mode: 'auto', label: 'Orchestrate (auto)', hint: 'Soriku routes to the best model via the capability map.' },
    { mode: 'single', label: 'Single model', hint: 'Always use one specific model.' },
    { mode: 'plan', label: 'Plan (multi-worker)', hint: 'Soriku decomposes the task and runs workers, then merges one answer.' },
    { mode: 'ensemble', label: 'Ensemble (merge)', hint: 'Several models answer in parallel; Soriku merges them into one.' },
];

const WORKER_COUNTS = ['auto', '2', '3', '4', '5'];

/** Modes that run several collaborating models, so the worker-count picker applies. */
const MULTI_WORKER_MODES: ChatMode[] = ['plan', 'ensemble'];

function usesWorkers(mode: ChatMode): boolean {
    return MULTI_WORKER_MODES.includes(mode);
}

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

    /** Orchestration controls. */
    protected mode: ChatMode = 'auto';
    protected modelId = '';
    protected workerCount = 'auto';
    protected workerModels: string[] = [];
    protected models: V1ModelDescriptor[] = [];

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
        this.loadModels();
        this.update();
    }

    /** Load the model list once for the Single-model picker (chat-capable models only). */
    protected async loadModels(): Promise<void> {
        try {
            const response = await this.engineClient.listModels();
            this.models = (response.data ?? []).filter(m => !/embed/i.test(m.id));
            this.update();
        } catch {
            /* picker stays empty; modes other than Single are unaffected */
        }
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
                    mode: this.mode,
                    modelId: this.mode === 'single' && this.modelId ? this.modelId : undefined,
                    workerCount: usesWorkers(this.mode) ? this.workerCount : undefined,
                    workerModels: this.mode === 'ensemble' && this.workerModels.length >= 2 ? this.workerModels : undefined,
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
                } else if (event.type === 'plan_awaiting_execution' && typeof event.plan_id === 'string') {
                    // Plan parked for confirmation; resume it so the same stream runs the
                    // workers + synthesis. Fire-and-forget — events arrive on this stream.
                    this.engineClient.executePlan(event.plan_id).catch(() => { /* stream will surface errors */ });
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
        const agentName = this.selection.getActiveName();
        return <div className='soriku-chat'>
            <div className='soriku-chat-header'>
                {agentId
                    ? <span>Agent: <span className='soriku-chat-agent'>{agentName ?? agentId}</span></span>
                    : <span className='soriku-chat-noagent'>No agent selected — pick one in the Agents panel.</span>}
            </div>
            {agentId && this.renderOrchestration()}
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
                {turn.workers.length > 0 && <span className='soriku-msg-workers' title='Models that collaborated on this answer'>
                    {turn.workers.length} workers: {turn.workers.join(', ')}
                </span>}
            </div>
            {turn.text && <div className='soriku-msg-text'>{turn.text}</div>}
            {turn.status === 'streaming' && this.renderBusy(turn)}
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

    /** Animated busy indicator shown while a turn streams (spinner + current phase). */
    protected renderBusy(turn: AssistantTurn): React.ReactNode {
        return <div className='soriku-msg-busy'>
            <span className='codicon codicon-loading codicon-modifier-spin' />
            <span className='soriku-busy-label'>{busyPhase(turn)}</span>
            <span className='soriku-busy-dots'><span>.</span><span>.</span><span>.</span></span>
        </div>;
    }

    /** Orchestration toolbar: mode + (single) model picker + (ensemble) worker count. */
    protected renderOrchestration(): React.ReactNode {
        const active = ORCHESTRATION_OPTIONS.find(o => o.mode === this.mode) ?? ORCHESTRATION_OPTIONS[0];
        return <div className='soriku-chat-orchestration'>
            <select
                className='theia-select soriku-mode-select'
                title={active.hint}
                value={this.mode}
                disabled={this.streaming}
                onChange={e => { this.mode = e.target.value as ChatMode; this.update(); }}
            >
                {ORCHESTRATION_OPTIONS.map(o => <option key={o.mode} value={o.mode}>{o.label}</option>)}
            </select>
            {this.mode === 'single' && <select
                className='theia-select soriku-model-select'
                title='Model to use for every answer'
                value={this.modelId}
                disabled={this.streaming}
                onChange={e => { this.modelId = e.target.value; this.update(); }}
            >
                <option value=''>{this.models.length ? 'Pick a model…' : 'No models available'}</option>
                {this.models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>}
            {this.mode === 'plan' && <select
                className='theia-select soriku-worker-select'
                title='How many models collaborate on one answer'
                value={this.workerCount}
                disabled={this.streaming}
                onChange={e => { this.workerCount = e.target.value; this.update(); }}
            >
                {WORKER_COUNTS.map(w => <option key={w} value={w}>{w === 'auto' ? 'auto workers' : `${w} workers`}</option>)}
            </select>}
            {this.mode === 'ensemble' && <div className='soriku-worker-models'>
                <select
                    multiple
                    className='theia-select soriku-models-multiselect'
                    title='Pick the models that collaborate on one answer'
                    size={Math.min(6, Math.max(3, this.models.length))}
                    disabled={this.streaming || this.models.length === 0}
                    value={this.workerModels}
                    onChange={e => { this.workerModels = Array.from(e.target.selectedOptions).map(o => o.value); this.update(); }}
                >
                    {this.models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
                <div className='soriku-worker-models-hint'>
                    {this.workerModels.length >= 2
                        ? `${this.workerModels.length} models will collaborate`
                        : 'Pick 2+ models to combine (empty = Soriku chooses)'}
                </div>
            </div>}
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
