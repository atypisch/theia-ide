/********************************************************************************
 * Soriku IDE — agent chat widget (SSE streaming, model transparency)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService, MessageService, PreferenceService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuModelCatalog } from 'soriku-engine-client-ext/lib/browser/soriku-model-catalog';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { SorikuPlanLiveBridge } from 'soriku-engine-client-ext/lib/browser/soriku-plan-live-bridge';
import { ChatMode, ChatStreamParams, ProviderInfo, RoutingStrategy, V1ModelDescriptor } from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuEditorContextCollector } from 'soriku-engine-client-ext/lib/browser/soriku-editor-context-collector';
import { buildEditorContextItems } from 'soriku-engine-client-ext/lib/common/editor-context';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuToolConfirmationService } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-confirmation-service';
import { SorikuToolApprovalBridge } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-approval-bridge';
import { SorikuEditorRevealService } from 'soriku-tools-bridge-ext/lib/browser/soriku-editor-reveal-service';
import { shouldRevealWrite } from 'soriku-tools-bridge-ext/lib/common/agent-activity';
import { ChatMarkdown } from './chat-markdown-view';
import { ChatStreamController } from './chat-stream-controller';
import {
    AgentActivity,
    AgentInsights,
    AssistantTurn,
    ChatMessage,
    ChatToolCall,
    PlanTaskView,
    busyPhase,
    createAssistantTurn,
    formatToolCallSummary,
    fromEngineMessages,
    reduceSseEvent,
    summarizeAgentInsights,
    withWorkspacePrefix,
} from '../common/chat-model';

/** Persisted (across reloads) pointer to the chat the user was last in. */
const ACTIVE_CHAT_STORAGE_KEY = 'soriku.chat.active';
/** User-configurable term for a head agent's spawned sub-agents (Fase F). */
const SUBAGENT_LABEL_PREF = 'soriku.ui.subagentLabel';
/** Per-plan cloud spend cap (EUR); negative = no IDE cap (engine default). */
const CLOUD_COST_CAP_PREF = 'soriku.routing.cloudCostCapEur';
interface ActiveChatState { conversationId: string; agentId?: string; agentName?: string; }

/** How the agent works (Cursor-style behaviour), independent of model choice. */
type AgentBehavior = 'auto' | 'edit' | 'plan' | 'chat';

interface BehaviorOption {
    value: AgentBehavior;
    label: string;
    hint: string;
}

/** Short badge labels for non-clean tool outcomes (engine reliability signals). */
const OUTCOME_LABELS: Record<string, string> = {
    blocked: 'blocked',
    salvaged: 'recovered',
    denied: 'denied',
    error: 'error',
    verify_failed: 'fixing',
    verified: 'verified ✓',
};

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

/**
 * Where compute runs, per request — local-first by default. Sent as
 * `routingStrategy`; never changes the soriku web app's saved setting.
 */
interface RoutingOption {
    value: RoutingStrategy;
    label: string;
    hint: string;
}

const ROUTING_OPTIONS: RoutingOption[] = [
    { value: 'prefer_local', label: 'Local-first', hint: 'Local models only — nothing leaves this machine. Default.' },
    { value: 'local_with_remote_conductor', label: 'Hybrid', hint: 'Local workers do the work; a stronger remote model may plan.' },
    { value: 'balanced', label: 'Balanced', hint: 'Cost-aware mix of local and cloud models.' },
    { value: 'prefer_quality', label: 'Best quality', hint: 'Pick the best model regardless of locality or cost (cloud allowed).' },
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

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(SorikuToolConfirmationService)
    protected readonly toolConfirmation: SorikuToolConfirmationService;

    @inject(ChatStreamController)
    protected readonly streamController: ChatStreamController;

    @inject(SorikuToolApprovalBridge)
    protected readonly toolApproval: SorikuToolApprovalBridge;

    @inject(SorikuEditorRevealService)
    protected readonly editorReveal: SorikuEditorRevealService;

    @inject(SorikuModelCatalog)
    protected readonly catalog: SorikuModelCatalog;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    @inject(SorikuPlanLiveBridge)
    protected readonly planLiveBridge: SorikuPlanLiveBridge;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(SorikuEditorContextCollector)
    protected readonly editorContext: SorikuEditorContextCollector;

    /** When restoring/loading a saved chat, suppress the agent-change reset. */
    protected restoring = false;

    protected conversation: ChatMessage[] = [];
    protected feedbackByTurn = new Map<string, 'positive' | 'negative'>();
    /** Fase E insights panel: what the active agent has learned. */
    protected insightsOpen = false;
    protected insights?: AgentInsights;
    protected insightsAgentId?: string;
    protected insightsLoading = false;
    protected conversationId: string | undefined;
    protected conversationTitle?: string;
    protected idSeq = 0;
    protected inputRef = React.createRef<HTMLTextAreaElement>();

    /** One stream at a time — backed by the controller (P4-a), so there is a single source of truth. */
    protected get streaming(): boolean {
        return this.streamController.active;
    }

    /** Controls: agent behaviour (Mode) + model orchestration (Models). */
    protected behavior: AgentBehavior = 'auto';
    protected orchestration: Orchestration = 'auto';
    /**
     * Per-request routing strategy — local-first by default (the soriku principle).
     * Sent to the engine per request; never writes the global setting.
     */
    protected routingStrategy: RoutingStrategy = 'prefer_local';
    protected modelId = '';
    protected workerModels: string[] = [];
    protected models: V1ModelDescriptor[] = [];
    protected providers: ProviderInfo[] = [];
    /** Plan id currently being approved/cancelled (to disable the buttons). */
    protected resolvingPlans = new Set<string>();
    /** User-edited task goals keyed by plan id, then task id. */
    protected planTaskEdits = new Map<string, Map<string, string>>();
    /** Coalesce React re-renders during SSE streaming (Cursor-style ~60fps cap). */
    protected updateScheduled = false;

    protected scheduleUpdate(immediate = false): void {
        if (this.isDisposed) {
            return;
        }
        if (immediate) {
            this.updateScheduled = false;
            this.update();
            return;
        }
        if (this.updateScheduled) {
            return;
        }
        this.updateScheduled = true;
        requestAnimationFrame(() => {
            this.updateScheduled = false;
            // The widget may have been closed between scheduling and this frame (#17).
            if (this.isDisposed) {
                return;
            }
            this.update();
        });
    }
    /** Live follow of an engine plan started outside this widget (CLI/API). */
    protected externalFollowConvId?: string;
    protected externalTurnIndex = -1;
    protected approvalRememberSession = false;

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
        // Reload the model list + availability live when the catalog changes
        // (a model pulled/removed or a provider added in the Manage Models view).
        this.toDispose.push(this.catalog.onDidChange(() => {
            this.loadModels();
            this.loadProviders();
        }));
        // Open a stored conversation when the user picks one in the history panel.
        this.toDispose.push(this.conversationLink.onDidRequestOpen(id => {
            this.loadConversation(id).catch(e => this.messages.error(`Could not open conversation: ${(e as Error).message}`));
        }));
        this.toDispose.push(this.conversationLink.onDidReviewWrite(({ accepted, path }) => {
            void this.submitImplicitWriteFeedback(accepted, path);
        }));
        this.toDispose.push(this.planLiveBridge.onDidReceivePlanEvent(event => {
            void this.ingestLivePlanEvent(event);
        }));
        this.toDispose.push({ dispose: this.toolApproval.onPendingChange(() => this.scheduleUpdate()) });
        // Closing the panel mid-stream must stop everything: abort the SSE loop (so it
        // no longer mutates state / executes delegated tools / writes files) and flush
        // any pending approvals so the engine stream isn't left blocked (#2/#1).
        this.toDispose.push({
            dispose: () => {
                this.streamController.abort();
                this.toolApproval.cancelAll();
            },
        });
        this.loadModels();
        this.loadProviders();
        this.restoreActiveChat();
        this.update();
    }

    /** Resume the last active conversation across IDE reloads. */
    protected async restoreActiveChat(): Promise<void> {
        let state: ActiveChatState | undefined;
        try {
            state = await this.storage.getData<ActiveChatState | undefined>(ACTIVE_CHAT_STORAGE_KEY, undefined);
        } catch {
            return;
        }
        if (state?.conversationId) {
            await this.loadConversation(state.conversationId, state.agentId, state.agentName).catch(() => { /* stale id — ignore */ });
        }
    }

    /** Load a stored conversation (messages + context) into the chat. */
    protected async loadConversation(id: string, agentIdHint?: string, agentNameHint?: string): Promise<void> {
        const conv = await this.engineClient.getConversation(id);
        const agentId = (conv.persona_id as string | undefined) ?? agentIdHint;
        this.restoring = true;
        try {
            if (agentId) {
                this.selection.setActive(agentId, agentNameHint);
            }
        } finally {
            this.restoring = false;
        }
        this.conversation = fromEngineMessages(conv.messages ?? []);
        this.conversationId = conv.id;
        this.conversationTitle = conv.title;
        this.conversationLink.notifyChanged();
        this.feedbackByTurn.clear();
        this.persistActiveChat();
        this.update();
    }

    /** Start a fresh conversation (keeps the active agent). */
    protected startNewConversation(): void {
        this.streamController.abort();
        this.conversation = [];
        this.feedbackByTurn.clear();
        this.conversationId = undefined;
        this.conversationTitle = undefined;
        this.storage.setData(ACTIVE_CHAT_STORAGE_KEY, undefined).catch(() => { /* best-effort */ });
        this.update();
    }

    /** Workspace root path sent to the engine as project_id. */
    protected async workspaceProjectId(): Promise<string | undefined> {
        const roots = await this.workspaceService.roots;
        const path = roots[0]?.resource.path.toString();
        return path && path.length > 0 ? path : undefined;
    }

    /** Persist the active conversation pointer for reload-resume. */
    protected persistActiveChat(): void {
        if (!this.conversationId) {
            return;
        }
        const state: ActiveChatState = {
            conversationId: this.conversationId,
            agentId: this.selection.getActiveId(),
            agentName: this.selection.getActiveName(),
        };
        this.storage.setData(ACTIVE_CHAT_STORAGE_KEY, state).catch(() => { /* best-effort */ });
    }

    /** Load the model list once for the Single-model picker (chat-capable models only). */
    protected async loadModels(): Promise<void> {
        try {
            const response = await this.engineClient.listModels();
            this.models = (response.data ?? []).filter(m => !/embed/i.test(m.id));
            this.warmSelectedModel();
            this.update();
        } catch {
            /* picker stays empty; modes other than Single are unaffected */
        }
    }

    /** Opportunistically preload the picked local model to cut first-token latency. */
    protected warmSelectedModel(): void {
        if (this.orchestration !== 'single' || !this.modelId) {
            return;
        }
        const avail = this.modelAvailability(this.modelId);
        if (!avail.ok) {
            return;
        }
        const bare = this.modelId.includes(':')
            ? this.modelId.slice(this.modelId.indexOf(':') + 1)
            : this.modelId;
        this.engineClient.warmModel(bare).catch(() => { /* best-effort */ });
    }

    /** Load provider health so unavailable models (bad/expired key, no credits) are marked. */
    protected async loadProviders(): Promise<void> {
        try {
            const response = await this.engineClient.listProviders();
            this.providers = response.providers ?? [];
            this.update();
        } catch {
            /* availability unknown → models are not blocked */
        }
    }

    /** Availability of a model based on its provider's live health. */
    protected modelAvailability(modelId: string): { ok: boolean; reason?: string } {
        if (this.providers.length === 0) {
            return { ok: true }; // health unknown — don't block
        }
        const prefix = modelId.includes(':') ? modelId.slice(0, modelId.indexOf(':')) : '';
        const remote = this.providers.find(p => !p.is_local && p.name === prefix);
        const provider = remote ?? this.providers.find(p => p.is_local);
        if (!provider) {
            return { ok: true };
        }
        return provider.healthy
            ? { ok: true }
            : { ok: false, reason: provider.error ?? `${provider.display_name} unavailable` };
    }

    /** Switching the active agent starts a fresh conversation (no cross-agent history). */
    protected onAgentChanged(): void {
        // Loading a saved conversation re-selects its agent; don't wipe it then.
        if (this.restoring) {
            return;
        }
        this.streamController.abort();
        // Flush any pending tool approvals from the previous agent so they can't
        // resolve into the new context or strand the engine stream (#16/#1).
        this.toolApproval.cancelAll();
        this.conversation = [];
        this.feedbackByTurn.clear();
        this.insights = undefined;
        this.insightsAgentId = undefined;
        this.conversationId = undefined;
        this.conversationTitle = undefined;
        // Explicit agent switch starts fresh — forget the resumed pointer.
        this.storage.setData(ACTIVE_CHAT_STORAGE_KEY, undefined).catch(() => { /* best-effort */ });
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
        const initialTurn = createAssistantTurn(this.nextId());
        const turnIndex = this.conversation.push(initialTurn) - 1;
        this.editorReveal.resetDedup();
        this.scheduleUpdate(true);
        const params = await this.buildStreamParams(text, agentId);
        // The controller owns the lifecycle (P4-a): abort, reduce, typed errors,
        // tool/plan fan-out. This widget only renders the turns it hands back.
        const finalTurn = await this.streamController.run({
            params,
            initialTurn,
            needsApproval: params.mode === 'plan',
            tools: this.toolConfirmation,
            isDisposed: () => this.isDisposed,
            onTurn: (turn, event) => {
                this.conversation[turnIndex] = turn;
                if (turn.conversationId && turn.conversationId !== this.conversationId) {
                    this.conversationId = turn.conversationId;
                    this.persistActiveChat();
                }
                void this.handleLiveActivity(event);
                this.scheduleUpdate();
            },
        });
        this.conversation[turnIndex] = finalTurn;
        this.conversationLink.notifyChanged();
        this.scheduleUpdate(true);
    }

    /** Re-send the user message that produced an interrupted turn (#5, manual retry). */
    protected retryTurn(turnId: string): void {
        const turnIndex = this.conversation.findIndex(entry => entry.id === turnId);
        for (let i = turnIndex - 1; i >= 0; i--) {
            const entry = this.conversation[i];
            if (entry.role === 'user') {
                void this.send(entry.text);
                return;
            }
        }
    }

    /** Translate the two pickers (behaviour + models) into engine stream params. */
    protected async buildStreamParams(text: string, agentId: string): Promise<ChatStreamParams> {
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

        const [projectId, editorContext] = await Promise.all([
            this.workspaceProjectId(),
            this.buildEditorContext(text),
        ]);

        // C-B: the engine's guard/learnings extractors read the USER prompt, not the
        // context items — carry the workspace line there so per-project learnings,
        // soriku.md guidelines and the write-guard actually engage for IDE chats.
        const roots = await this.workspaceService.roots;
        const wirePrompt = withWorkspacePrefix(text, roots[0]?.resource.path.toString());

        return {
            prompt: wirePrompt,
            personaId: agentId,
            conversationId: this.conversationId,
            projectId,
            useWorker: true,
            mode,
            context: editorContext,
            clientTools: editsEnabled ? this.toolConfirmation.delegatedTools() : undefined,
            toolsEnabled: editsEnabled ? undefined : false,
            modelId: single ? this.modelId : undefined,
            workerModels: ensemble ? this.workerModels : undefined,
            planAutoExecute: this.behavior === 'plan' ? false : undefined,
            routingStrategy: this.routingStrategy,
            cloudCostCapEur: this.getCloudCostCap(),
        };
    }

    /**
     * Per-request cloud spend cap (EUR) from preferences. A negative pref means
     * "no IDE cap" → undefined, so the engine keeps its own default. 0 blocks
     * any paid (cloud) plan, making cloud usage capped from Soriku IDE.
     */
    protected getCloudCostCap(): number | undefined {
        const cap = this.preferences.get<number>(CLOUD_COST_CAP_PREF, -1);
        return typeof cap === 'number' && cap >= 0 ? cap : undefined;
    }

    /** @file mentions + the workspace root as engine context items (no editor tabs yet — that is Fix A). */
    protected async buildEditorContext(prompt: string): Promise<import('soriku-engine-client-ext/lib/common/engine-types').ChatContextItem[]> {
        const items: import('soriku-engine-client-ext/lib/common/engine-types').ChatContextItem[] = [];
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (root) {
            // Exact `Workspace:` wording — the engine greps for `workspace:` (C-B).
            items.push({ type: 'text', value: `Workspace: ${root.path.toString()}` });
        }
        // Fix A (C-A): live editor context — active file, selection or cursor
        // window, open tabs — so "explain this" has a referent. Preference-gated.
        if (this.preferences.get<boolean>('soriku.context.editorEnabled', true) !== false) {
            items.push(...buildEditorContextItems(this.editorContext.collect()));
        }
        const mentionRe = /@([\w./-]+\.(?:html|js|ts|tsx|py|css|json|md))/g;
        let match: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((match = mentionRe.exec(prompt)) !== null) {
            const rel = match[1];
            if (seen.has(rel)) {
                continue;
            }
            seen.add(rel);
            items.push({ type: 'file', value: rel });
        }
        return items;
    }

    /** Approve a parked Plan so the engine runs it (Plan mode). */
    protected approvePlan(planId: string, tasks: PlanTaskView[]): void {
        this.resolvingPlans.add(planId);
        this.update();
        const edits = this.collectPlanTaskEdits(planId, tasks);
        const body = edits.length > 0 ? { task_edits: edits } : undefined;
        this.engineClient.executePlan(planId, body).catch(() => { /* stream surfaces errors */ });
        this.planTaskEdits.delete(planId);
    }

    /** Cancel a parked Plan before any worker runs (Plan mode). */
    protected cancelPlan(planId: string): void {
        this.resolvingPlans.add(planId);
        this.update();
        this.engineClient.cancelPlan(planId).catch(() => { /* stream surfaces errors */ });
        this.planTaskEdits.delete(planId);
    }

    protected getPlanTaskGoal(planId: string, taskId: string, defaultGoal: string): string {
        return this.planTaskEdits.get(planId)?.get(taskId) ?? defaultGoal;
    }

    protected setPlanTaskGoal(planId: string, taskId: string, goal: string): void {
        let byTask = this.planTaskEdits.get(planId);
        if (!byTask) {
            byTask = new Map();
            this.planTaskEdits.set(planId, byTask);
        }
        byTask.set(taskId, goal);
    }

    protected collectPlanTaskEdits(planId: string, tasks: PlanTaskView[]): { id: string; goal: string }[] {
        const byTask = this.planTaskEdits.get(planId);
        if (!byTask) {
            return [];
        }
        const edits: { id: string; goal: string }[] = [];
        for (const task of tasks) {
            const edited = byTask.get(task.id);
            if (edited !== undefined && edited.trim() !== task.goal.trim()) {
                edits.push({ id: task.id, goal: edited.trim() });
            }
        }
        return edits;
    }

    protected stop(): void {
        this.streamController.abort();
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

    /**
     * Fase E: turn a diff-review decision into implicit agent feedback — accept =
     * the proposed code was good, reject = it wasn't — so the agent learns from
     * what the user actually keeps, with zero extra effort.
     */
    protected async submitImplicitWriteFeedback(accepted: boolean, path: string): Promise<void> {
        const agentId = this.selection.getActiveId();
        if (!agentId) {
            return;
        }
        try {
            await this.engineClient.sendAgentFeedback(agentId, {
                rating: accepted ? 'positive' : 'negative',
                input: `Proposed write to ${path}`,
                output: accepted ? 'User accepted the change.' : 'User rejected the change.',
            });
        } catch {
            /* implicit feedback is best-effort — never interrupt the user */
        }
    }

    /** Toggle the insights panel; (re)load the active agent's learnings on open. */
    protected async toggleInsights(): Promise<void> {
        this.insightsOpen = !this.insightsOpen;
        const agentId = this.selection.getActiveId();
        this.update();
        if (!this.insightsOpen || !agentId) {
            return;
        }
        if (this.insights && this.insightsAgentId === agentId) {
            return; // cached for this agent
        }
        this.insightsLoading = true;
        this.update();
        try {
            const res = await this.engineClient.getAgent(agentId);
            this.insights = summarizeAgentInsights(res.data);
            this.insightsAgentId = agentId;
        } catch (e) {
            this.insights = undefined;
            this.messages.error(`Could not load insights: ${(e as Error).message}`);
        } finally {
            this.insightsLoading = false;
            this.update();
        }
    }

    protected renderInsights(): React.ReactNode {
        const ins = this.insights;
        return <div className='soriku-insights'>
            {this.insightsLoading && <div className='soriku-insights-loading'>Loading what this agent learned…</div>}
            {!this.insightsLoading && ins && <>
                {typeof ins.interactions === 'number' && <div className='soriku-insights-stat'>
                    {ins.interactions} interaction{ins.interactions === 1 ? '' : 's'} learned from
                </div>}
                {ins.topPatterns.length > 0 && <div className='soriku-insights-section'>
                    <div className='soriku-insights-label'>Focus areas (learned)</div>
                    <div className='soriku-insights-chips'>
                        {ins.topPatterns.map(p => <span key={p.keyword} className='soriku-insights-chip'
                            title={`weight ${p.weight.toFixed(2)}`}>{p.keyword}</span>)}
                    </div>
                </div>}
                {ins.domainRules.length > 0 && <div className='soriku-insights-section'>
                    <div className='soriku-insights-label'>Domain rules</div>
                    <ul className='soriku-insights-list'>{ins.domainRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>}
                {ins.antiPatterns.length > 0 && <div className='soriku-insights-section'>
                    <div className='soriku-insights-label'>Anti-patterns</div>
                    <ul className='soriku-insights-list soriku-insights-anti'>{ins.antiPatterns.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>}
                {ins.specializations.length > 0 && <div className='soriku-insights-section'>
                    <div className='soriku-insights-label'>Specializations</div>
                    <div className='soriku-insights-chips'>
                        {ins.specializations.map(s => <span key={s} className='soriku-insights-chip'>{s}</span>)}
                    </div>
                </div>}
                {ins.topPatterns.length === 0 && ins.domainRules.length === 0 && ins.antiPatterns.length === 0
                    && <div className='soriku-insights-empty'>This agent hasn't learned anything specific yet — use it and give feedback.</div>}
            </>}
        </div>;
    }

    protected render(): React.ReactNode {
        const agentId = this.selection.getActiveId();
        const agentName = this.selection.getActiveName();
        return <div className='soriku-chat'>
            <div className='soriku-chat-header'>
                <div className='soriku-chat-header-main'>
                    {agentId
                        ? <span>Agent: <span className='soriku-chat-agent'>{agentName ?? agentId}</span></span>
                        : <span className='soriku-chat-noagent'>No agent selected — pick one in the Agents panel.</span>}
                    {this.conversationTitle && <span className='soriku-chat-conv-title' title={this.conversationTitle}>{this.conversationTitle}</span>}
                </div>
                <div className='soriku-chat-header-actions'>
                    {agentId && <button className='theia-button secondary soriku-chat-insights-toggle'
                        title='What this agent has learned' onClick={() => this.toggleInsights()}>
                        <span className='codicon codicon-lightbulb' /> Insights
                    </button>}
                    <button className='theia-button secondary soriku-chat-new' title='Start a new conversation'
                        disabled={this.streaming || !agentId} onClick={() => this.startNewConversation()}>
                        New chat
                    </button>
                </div>
            </div>
            {agentId && this.insightsOpen && this.renderInsights()}
            {agentId && this.renderControls()}
            <div className='soriku-chat-messages'>
                {this.conversation.length === 0
                    ? <div className='soriku-chat-empty'>Ask the agent a question to start.</div>
                    : this.conversation.map(message => this.renderMessage(message))}
            </div>
            {this.renderInlineToolApproval()}
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
                {turn.escalation && <span
                    className='soriku-msg-escalation'
                    title={`Escalated${turn.escalation.from ? ` from ${turn.escalation.from}` : ''}${turn.escalation.reason ? ` (${turn.escalation.reason})` : ''}`}
                >⤴ escalated → {turn.escalation.to ?? 'another model'}</span>}
                {typeof turn.ttftMs === 'number' && <span className='soriku-msg-timing' title='Time to first token'>
                    {turn.ttftMs < 1000 ? `${turn.ttftMs}ms` : `${(turn.ttftMs / 1000).toFixed(1)}s`} TTFT
                </span>}
            </div>
            {turn.text && <ChatMarkdown text={turn.text} streaming={turn.status === 'streaming'} />}
            {this.shouldShowApproval(turn) && this.renderPlanApproval(turn)}
            {turn.agents.length > 0 && this.renderFleet(turn)}
            {turn.status === 'streaming' && !turn.text && !this.shouldShowApproval(turn) && this.renderBusy(turn)}
            {turn.toolCalls.map((call, i) => this.renderToolCall(turn.id, call, i))}
            {turn.generatedFiles.length > 0 && this.renderGeneratedFiles(turn)}
            {turn.status === 'error' && <div className='soriku-msg-error'>
                {turn.error}
                {turn.authRequired && <span className='soriku-msg-error-actions'>
                    <button className='theia-button secondary' onClick={() => this.commands.executeCommand('soriku.auth.connect')}>Sign in…</button>
                    <button className='theia-button secondary' onClick={() => this.retryTurn(turn.id)}>Retry</button>
                </span>}
            </div>}
            {turn.status === 'interrupted' && <div className='soriku-msg-interrupted'>
                <span>Connection interrupted — partial answer kept.</span>
                <button className='theia-button secondary' onClick={() => this.retryTurn(turn.id)}>Retry</button>
            </div>}
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
                    <div className='soriku-plan-task-head'>
                        <span className='soriku-plan-role'>{t.role}</span>
                        {t.model && <span className='soriku-plan-model'>{t.model}</span>}
                    </div>
                    <textarea
                        className='theia-input soriku-plan-goal-edit'
                        rows={2}
                        disabled={resolving}
                        value={this.getPlanTaskGoal(plan.planId, t.id, t.goal)}
                        onChange={e => {
                            this.setPlanTaskGoal(plan.planId, t.id, e.target.value);
                            this.scheduleUpdate(true);
                        }}
                    />
                </li>)}
            </ol>
            <div className='soriku-plan-actions'>
                <button className='theia-button' disabled={resolving} onClick={() => this.approvePlan(plan.planId, plan.tasks)}>
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
        const routing = ROUTING_OPTIONS.find(o => o.value === this.routingStrategy) ?? ROUTING_OPTIONS[0];
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
                    className='theia-select soriku-routing-select'
                    title={`Where compute runs · ${routing.hint}`}
                    value={this.routingStrategy}
                    disabled={this.streaming}
                    onChange={e => { this.routingStrategy = e.target.value as RoutingStrategy; this.update(); }}
                >
                    {ROUTING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    className='theia-select soriku-models-select'
                    title={orchestration.hint}
                    value={this.orchestration}
                    disabled={this.streaming}
                    onChange={e => { this.orchestration = e.target.value as Orchestration; this.warmSelectedModel(); this.update(); }}
                >
                    {ORCHESTRATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                    className='soriku-manage-models'
                    title='Add or manage models'
                    onClick={() => this.commands.executeCommand('soriku.models.open')}
                >
                    <span className='codicon codicon-gear' />
                </button>
            </div>
            {this.orchestration === 'single' && <select
                className='theia-select soriku-model-select'
                title='Model to use for the answer'
                value={this.modelId}
                disabled={this.streaming}
                onChange={e => { this.modelId = e.target.value; this.warmSelectedModel(); this.update(); }}
            >
                <option value=''>{this.models.length ? 'Pick a model…' : 'No models available'}</option>
                {this.models.map(m => {
                    const avail = this.modelAvailability(m.id);
                    return <option key={m.id} value={m.id} disabled={!avail.ok}>
                        {m.id}{avail.ok ? '' : ` — ${avail.reason}`}
                    </option>;
                })}
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
                        : this.models.map(m => {
                            const avail = this.modelAvailability(m.id);
                            return <label key={m.id} className={`soriku-model-checkitem${avail.ok ? '' : ' unavailable'}`} title={avail.ok ? m.id : `${m.id} — ${avail.reason}`}>
                                <input
                                    type='checkbox'
                                    checked={this.workerModels.includes(m.id)}
                                    disabled={this.streaming || !avail.ok}
                                    onChange={() => this.toggleWorkerModel(m.id)}
                                />
                                <span className='soriku-model-checklabel'>{m.id}{avail.ok ? '' : ` — ${avail.reason}`}</span>
                            </label>;
                        })}
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

    /** The user-configurable term for a head agent's spawned sub-agents (Fase F). */
    protected getSubagentLabel(): string {
        const raw = this.preferences.get<string>(SUBAGENT_LABEL_PREF, 'minions');
        return (raw ?? 'minions').trim() || 'minions';
    }

    /** Fleet view: one row per parallel worker/agent, with minions nested under their head. */
    protected renderFleet(turn: AssistantTurn): React.ReactNode {
        const active = turn.agents.filter(a => a.status === 'running').length;
        // Minions (parentAgentId set) nest under the head whose personaId matches.
        const heads = new Set(turn.agents.map(a => a.personaId).filter((id): id is string => !!id));
        const minionsByParent = new Map<string, AgentActivity[]>();
        const topLevel: AgentActivity[] = [];
        for (const a of turn.agents) {
            if (a.parentAgentId && heads.has(a.parentAgentId)) {
                const list = minionsByParent.get(a.parentAgentId) ?? [];
                list.push(a);
                minionsByParent.set(a.parentAgentId, list);
            } else {
                topLevel.push(a);
            }
        }
        const subLabel = this.getSubagentLabel();
        const subTitle = subLabel.charAt(0).toUpperCase() + subLabel.slice(1);
        return <div className='soriku-fleet'>
            <div className='soriku-fleet-head'>
                <span className='codicon codicon-organization' />
                <span>Agent fleet · {turn.agents.length}{active > 0 ? ` · ${active} active` : ''}</span>
            </div>
            {topLevel.map(a => {
                const minions = a.personaId ? minionsByParent.get(a.personaId) : undefined;
                return <React.Fragment key={a.workerId}>
                    {this.renderFleetRow(a)}
                    {minions && minions.length > 0 && <div className='soriku-fleet-minions'>
                        <div className='soriku-fleet-minions-head'>
                            <span className='codicon codicon-type-hierarchy-sub' />
                            <span>{subTitle} fleet · {minions.length}</span>
                        </div>
                        {minions.map(m => this.renderFleetRow(m, true))}
                    </div>}
                </React.Fragment>;
            })}
        </div>;
    }

    /** One Fleet row. `nested` indents it as a minion under its head agent. */
    protected renderFleetRow(a: AgentActivity, nested = false): React.ReactNode {
        const label = a.agentName ?? a.role ?? a.personaId ?? a.workerId.slice(0, 8);
        const sub = a.agentName && a.role ? a.role : undefined;
        return <div key={a.workerId} className={`soriku-fleet-row soriku-fleet-${a.status}${nested ? ' soriku-fleet-row-nested' : ''}`}>
            <span className={`soriku-fleet-dot soriku-fleet-dot-${a.status}`} />
            <span className='soriku-fleet-role' title={a.personaId ? `persona: ${a.personaId}` : a.workerId}>{label}</span>
            {sub && <span className='soriku-fleet-subrole'>{sub}</span>}
            {a.model && <span className='soriku-fleet-model'>{a.model}</span>}
            {a.files.length > 0 && <span className='soriku-fleet-files' title={a.files.join('\n')}>
                {a.files.length} file{a.files.length > 1 ? 's' : ''}
            </span>}
            {a.corrections > 0 && <span className='soriku-fleet-fix' title='Writes the engine blocked or recovered for this worker'>
                {a.corrections} fix
            </span>}
            {a.verdict && <span
                className={`soriku-fleet-verdict soriku-fleet-verdict-${a.verdict.status}`}
                title={a.verdict.notes ?? ''}
            >{a.verdict.status === 'approved' ? '✓ approved' : '⟳ changes'}</span>}
            <span className='soriku-fleet-status'>{a.status}</span>
        </div>;
    }

    protected renderGeneratedFiles(turn: AssistantTurn): React.ReactNode {
        return <ul className='soriku-generated-files'>
            {turn.generatedFiles.map(file => <li key={file.path}>
                <button className='soriku-generated-file' title={file.path}
                    onClick={() => this.openGeneratedFile(file.path)}>
                    <span className='codicon codicon-file' />
                    {file.filename ?? file.path.split('/').pop() ?? file.path}
                </button>
            </li>)}
        </ul>;
    }

    protected async openGeneratedFile(path: string): Promise<void> {
        try {
            const uri = new URI(path);
            const opener = await this.openerService.getOpener(uri);
            await opener.open(uri);
        } catch (e) {
            this.messages.error(`Could not open ${path}: ${(e as Error).message}`);
        }
    }

    protected async ingestLivePlanEvent(event: import('soriku-engine-client-ext/lib/common/engine-types').SorikuSseEvent): Promise<void> {
        if (this.streaming) {
            return;
        }
        const convId = typeof event.conversation_id === 'string' ? event.conversation_id : undefined;
        if (convId && convId !== this.externalFollowConvId) {
            await this.followExternalPlan(convId);
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
        void this.handleLiveActivity(event);
        this.conversationLink.notifyChanged();
        this.scheduleUpdate();
    }

    /** Attach to a plan conversation broadcast from the engine (CLI/API runs). */
    protected async followExternalPlan(convId: string): Promise<void> {
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
            this.persistActiveChat();
            this.conversationLink.requestOpen(convId);
            this.messages.info('Live plan gestart — je ziet file writes hier en in de editor.');
        } catch (e) {
            this.messages.error(`Kon plan-conversatie niet openen: ${(e as Error).message}`);
        }
    }

    protected async handleLiveActivity(event: import('soriku-engine-client-ext/lib/common/engine-types').SorikuSseEvent): Promise<void> {
        if (event.type === 'worker_tool_call' && shouldRevealWrite(event)) {
            const args = event.args && typeof event.args === 'object'
                ? event.args as Record<string, unknown>
                : {};
            const path = typeof args.path === 'string' ? args.path : '';
            if (path) {
                await this.editorReveal.revealPath(path);
            }
            return;
        }
        if (event.type === 'generated_files' || event.type === 'worker_done') {
            const files = event.type === 'generated_files'
                ? (Array.isArray(event.files) ? event.files : [])
                : (Array.isArray(event.generated_files) ? event.generated_files : []);
            const last = files[files.length - 1] as Record<string, unknown> | undefined;
            const path = last && typeof last.path === 'string' ? last.path : undefined;
            if (path) {
                await this.editorReveal.revealPath(path);
            }
        }
    }

    protected renderInlineToolApproval(): React.ReactNode {
        const pending = this.toolApproval.pending;
        if (!pending) {
            return undefined;
        }
        return <div className={`soriku-inline-approval${pending.view.destructive ? ' destructive' : ''}`}>
            <div className='soriku-inline-approval-head'>
                <span className='codicon codicon-shield' />
                <span className='soriku-inline-approval-title'>{pending.view.title}</span>
            </div>
            <pre className='soriku-inline-approval-msg'>{pending.view.message}</pre>
            <label className='soriku-inline-approval-remember'>
                <input
                    type='checkbox'
                    checked={this.approvalRememberSession}
                    onChange={e => { this.approvalRememberSession = e.target.checked; this.scheduleUpdate(true); }}
                />
                Allow always this session
            </label>
            <div className='soriku-inline-approval-actions'>
                <button className='theia-button secondary' onClick={() => this.respondToolApproval(false)}>Deny</button>
                <button className='theia-button' onClick={() => this.respondToolApproval(true)}>Allow</button>
            </div>
        </div>;
    }

    protected respondToolApproval(approved: boolean): void {
        this.toolApproval.respond(approved, approved && this.approvalRememberSession);
        this.approvalRememberSession = false;
        this.scheduleUpdate(true);
    }

    protected renderToolCall(turnId: string, call: ChatToolCall, index: number): React.ReactNode {
        const summary = formatToolCallSummary(call);
        const path = summary.subtitle;
        const outcome = call.outcome && call.outcome !== 'ok' ? call.outcome : undefined;
        return <div key={`${turnId}-tool-${index}`} className={`soriku-tool-call${summary.isWrite ? ' soriku-tool-write' : ''}${outcome ? ` soriku-tool-${outcome}` : ''}`}>
            <div className='soriku-tool-call-head'>
                <span className={`codicon ${summary.isWrite ? 'codicon-file-code' : 'codicon-tools'}`} />
                <span className='soriku-tool-title'>{summary.title}</span>
                <span className={`soriku-tool-status ${call.status}`}>{call.status}</span>
                {outcome && <span className={`soriku-tool-outcome soriku-tool-outcome-${outcome}`} title={call.outcomeReason ?? ''}>{OUTCOME_LABELS[outcome]}</span>}
                {path && summary.isWrite && <button
                    className='soriku-tool-open'
                    title='Open in editor'
                    onClick={() => this.openGeneratedFile(path)}
                >Open</button>}
            </div>
            {outcome && call.outcomeReason && <div className='soriku-tool-outcome-reason'>{call.outcomeReason}</div>}
            {summary.subtitle && <div className='soriku-tool-path'>{summary.subtitle}</div>}
            {summary.preview && <pre className='soriku-tool-preview'>{summary.preview}</pre>}
            {!summary.isWrite && <details className='soriku-tool-details'>
                <summary>Details</summary>
                <pre className='soriku-tool-detail'>{JSON.stringify({ args: call.args, result: call.result }, undefined, 2)}</pre>
            </details>}
        </div>;
    }
}
