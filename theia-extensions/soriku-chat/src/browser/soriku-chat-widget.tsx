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
import { ChatMode, ChatStreamParams, V1ModelDescriptor } from 'soriku-engine-client-ext/lib/common/engine-types';
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

/** How the agent works (Cursor-style behaviour), independent of model choice. */
type AgentBehavior = 'auto' | 'edit' | 'plan' | 'chat';

interface BehaviorOption {
    value: AgentBehavior;
    label: string;
    hint: string;
}

const BEHAVIOR_OPTIONS: BehaviorOption[] = [
    { value: 'auto', label: 'Auto', hint: 'Soriku decides per task whether to plan or act directly.' },
    { value: 'edit', label: 'Edit automatically', hint: 'The agent acts and edits files directly.' },
    { value: 'plan', label: 'Plan', hint: 'Soriku drafts a plan you approve before anything runs.' },
    { value: 'chat', label: 'Chat only', hint: 'Answer and discuss only — no file edits.' },
];

/** Which model(s) answer, independent of behaviour. */
type Orchestration = 'auto' | 'single' | 'ensemble';

interface OrchestrationOption {
    value: Orchestration;
    label: string;
    hint: string;
}

const ORCHESTRATION_OPTIONS: OrchestrationOption[] = [
    { value: 'auto', label: 'Auto model', hint: 'Soriku routes to the best model via the capability map.' },
    { value: 'single', label: 'Single model', hint: 'Use one specific model.' },
    { value: 'ensemble', label: 'Ensemble', hint: 'Several models you pick collaborate into one answer.' },
];

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

    /** Controls: agent behaviour (Mode) + model orchestration (Models). */
    protected behavior: AgentBehavior = 'auto';
    protected orchestration: Orchestration = 'auto';
    protected modelId = '';
    protected workerModels: string[] = [];
    protected models: V1ModelDescriptor[] = [];
    /** Plan ids currently being approved/cancelled (to disable the buttons). */
    protected resolvingPlans = new Set<string>();

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
        this.resolvingPlans.clear();
        this.conversation.push({ role: 'user', id: this.nextId(), text });
        let turn = createAssistantTurn(this.nextId());
        const turnIndex = this.conversation.push(turn) - 1;
        this.streaming = true;
        this.abortController = new AbortController();
        this.update();
        const params = this.buildStreamParams(text, agentId);
        const needsApproval = params.mode === 'plan';
        try {
            const stream = this.engineClient.chatStream(params, this.abortController.signal);
            for await (const event of stream) {
                turn = reduceSseEvent(turn, event);
                if (event.type === 'plan_awaiting_execution' && needsApproval) {
                    turn = { ...turn, planNeedsApproval: true };
                }
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
                } else if (event.type === 'plan_awaiting_execution' && typeof event.plan_id === 'string' && !needsApproval) {
                    // Not Plan mode (e.g. Ensemble): resume immediately so the same stream runs
                    // the workers + synthesis. Plan mode instead waits for the user to approve.
                    this.engineClient.executePlan(event.plan_id).catch(() => { /* stream surfaces errors */ });
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

    /** Translate the two pickers (behaviour + models) into engine stream params. */
    protected buildStreamParams(text: string, agentId: string): ChatStreamParams {
        const editsEnabled = this.behavior !== 'chat';
        const ensemble = this.orchestration === 'ensemble' && this.workerModels.length >= 2;
        const single = this.orchestration === 'single' && !!this.modelId;

        let mode: ChatMode;
        if (this.behavior === 'plan') {
            mode = 'plan';
        } else if (ensemble) {
            mode = 'ensemble';
        } else if (single) {
            mode = 'single';
        } else if (this.behavior === 'edit') {
            mode = 'single'; // act directly; router picks the model
        } else {
            mode = 'auto';
        }

        return {
            prompt: text,
            personaId: agentId,
            conversationId: this.conversationId,
            useWorker: true,
            mode,
            clientTools: editsEnabled ? this.toolConfirmation.delegatedTools() : undefined,
            toolsEnabled: editsEnabled ? undefined : false,
            modelId: single ? this.modelId : undefined,
            workerModels: ensemble ? this.workerModels : undefined,
        };
    }

    /** Approve a parked Plan so the engine runs it (Plan mode). */
    protected approvePlan(planId: string): void {
        this.resolvingPlans.add(planId);
        this.update();
        this.engineClient.executePlan(planId).catch(() => { /* stream surfaces errors */ });
    }

    /** Cancel a parked Plan before any worker runs (Plan mode). */
    protected cancelPlan(planId: string): void {
        this.resolvingPlans.add(planId);
        this.update();
        this.engineClient.cancelPlan(planId).catch(() => { /* stream surfaces errors */ });
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
            {agentId && this.renderControls()}
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
            {this.shouldShowApproval(turn) && this.renderPlanApproval(turn)}
            {turn.status === 'streaming' && !this.shouldShowApproval(turn) && this.renderBusy(turn)}
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

    protected shouldShowApproval(turn: AssistantTurn): boolean {
        return !!turn.planNeedsApproval && !!turn.awaitingApproval && !!turn.pendingPlan && turn.status === 'streaming';
    }

    /** Plan card with the proposed tasks + Approve/Cancel (Plan mode). */
    protected renderPlanApproval(turn: AssistantTurn): React.ReactNode {
        const plan = turn.pendingPlan!;
        const resolving = this.resolvingPlans.has(plan.planId);
        return <div className='soriku-plan-approval'>
            <div className='soriku-plan-title'>
                <span className='codicon codicon-checklist' /> Plan — review before it runs
                {typeof plan.costEur === 'number' && <span className='soriku-plan-cost'>est. €{plan.costEur.toFixed(2)}</span>}
            </div>
            <ol className='soriku-plan-tasks'>
                {plan.tasks.map(t => <li key={t.id}>
                    <span className='soriku-plan-role'>{t.role}</span>
                    {t.model && <span className='soriku-plan-model'>{t.model}</span>}
                    <span className='soriku-plan-goal'>{t.goal}</span>
                </li>)}
            </ol>
            <div className='soriku-plan-actions'>
                <button className='theia-button' disabled={resolving} onClick={() => this.approvePlan(plan.planId)}>
                    {resolving ? 'Starting…' : 'Approve & run'}
                </button>
                <button className='theia-button secondary' disabled={resolving} onClick={() => this.cancelPlan(plan.planId)}>
                    Cancel
                </button>
            </div>
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

    /** Controls: a Mode picker (behaviour) + a Models picker (orchestration), Cursor-style. */
    protected renderControls(): React.ReactNode {
        const behavior = BEHAVIOR_OPTIONS.find(o => o.value === this.behavior) ?? BEHAVIOR_OPTIONS[0];
        const orchestration = ORCHESTRATION_OPTIONS.find(o => o.value === this.orchestration) ?? ORCHESTRATION_OPTIONS[0];
        return <div className='soriku-chat-orchestration'>
            <div className='soriku-control-row'>
                <select
                    className='theia-select soriku-mode-select'
                    title={behavior.hint}
                    value={this.behavior}
                    disabled={this.streaming}
                    onChange={e => { this.behavior = e.target.value as AgentBehavior; this.update(); }}
                >
                    {BEHAVIOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    className='theia-select soriku-models-select'
                    title={orchestration.hint}
                    value={this.orchestration}
                    disabled={this.streaming}
                    onChange={e => { this.orchestration = e.target.value as Orchestration; this.update(); }}
                >
                    {ORCHESTRATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            {this.orchestration === 'single' && <select
                className='theia-select soriku-model-select'
                title='Model to use for the answer'
                value={this.modelId}
                disabled={this.streaming}
                onChange={e => { this.modelId = e.target.value; this.update(); }}
            >
                <option value=''>{this.models.length ? 'Pick a model…' : 'No models available'}</option>
                {this.models.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>}
            {this.orchestration === 'ensemble' && <div className='soriku-worker-models'>
                <div className='soriku-worker-models-hint'>
                    {this.workerModels.length >= 2
                        ? `${this.workerModels.length} models will collaborate`
                        : 'Tick 2+ models to combine (none = Soriku chooses)'}
                </div>
                <div className='soriku-model-checklist'>
                    {this.models.length === 0
                        ? <div className='soriku-worker-models-hint'>No models available</div>
                        : this.models.map(m => <label key={m.id} className='soriku-model-checkitem' title={m.id}>
                            <input
                                type='checkbox'
                                checked={this.workerModels.includes(m.id)}
                                disabled={this.streaming}
                                onChange={() => this.toggleWorkerModel(m.id)}
                            />
                            <span className='soriku-model-checklabel'>{m.id}</span>
                        </label>)}
                </div>
            </div>}
        </div>;
    }

    /** Toggle a model in the ensemble collaboration set. */
    protected toggleWorkerModel(modelId: string): void {
        this.workerModels = this.workerModels.includes(modelId)
            ? this.workerModels.filter(id => id !== modelId)
            : [...this.workerModels, modelId];
        this.update();
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
