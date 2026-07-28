/********************************************************************************
 * Soriku IDE — agent chat widget (SSE streaming, model transparency)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService, MessageService, PreferenceService } from '@theia/core/lib/common';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuModelCatalog } from 'soriku-engine-client-ext/lib/browser/soriku-model-catalog';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { SorikuPlanLiveBridge } from 'soriku-engine-client-ext/lib/browser/soriku-plan-live-bridge';
import {
    ChatMode, ChatStreamParams, MinionSpawnOutcome, ProviderInfo, RoutingStrategy,
    SubagentInsight, SubagentPotential, V1ModelDescriptor,
} from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuEditorContextCollector } from 'soriku-engine-client-ext/lib/browser/soriku-editor-context-collector';
import { buildEditorContextItems } from 'soriku-engine-client-ext/lib/common/editor-context';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuDefaultAgentResolver } from 'soriku-agents-ext/lib/browser/soriku-default-agent-resolver';
import { initials } from 'soriku-agents-ext/lib/common/agent-view';
import { SorikuToolConfirmationService } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-confirmation-service';
import { SorikuToolApprovalBridge } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-approval-bridge';
import { SorikuEditorRevealService } from 'soriku-tools-bridge-ext/lib/browser/soriku-editor-reveal-service';
import { SorikuGeneratedFilesTracker } from 'soriku-tools-bridge-ext/lib/browser/soriku-generated-files-tracker';
import { shouldRevealWrite } from 'soriku-tools-bridge-ext/lib/common/agent-activity';
import { SorikuShellService, formatTree } from 'soriku-tools-bridge-ext/lib/common/shell-service';
import { SORIKU_PLAN_MCP, DEFAULT_PLAN_MCP } from 'soriku-tools-bridge-ext/lib/browser/soriku-tools-preferences';
import { AgentAvatar, Badge, Btn, DiffBar, Overlay, Pill, SegmentedPicker, StatusDot, VerifyPill, toKnownCategory } from 'soriku-theme-ext/lib/browser/ui';
import { SorikuToastService } from 'soriku-theme-ext/lib/browser/soriku-toast-service';
import { ChatMarkdown } from './chat-markdown-view';
import { ChatStreamController } from './chat-stream-controller';
import { ChatSessionService } from './chat-session-service';
import { MIN_MAXIMIZED_WIDTH, maximizedPanelWidth } from '../common/panel-sizing';
import { ChatImageAttachment, canAddAttachment, isSupportedImageType } from '../common/chat-images';
import { processImageBlob } from './chat-image-processor';
import {
    AgentActivity,
    AgentInsights,
    AssistantTurn,
    ChatMessage,
    ChatToolCall,
    DEFAULT_RENDER_WINDOW,
    PendingPlan,
    PlanTaskView,
    roleLabel,
    SUBAGENT_ROLES,
    busyPhase,
    capConversation,
    createAssistantTurn,
    formatToolCallSummary,
    parseFileMentions,
    summarizeAgentInsights,
    visibleMessages,
    withWorkspacePrefix,
} from '../common/chat-model';

/** User-configurable term for a head agent's spawned sub-agents (Fase F). */
const SUBAGENT_LABEL_PREF = 'soriku.ui.subagentLabel';
/** Per-plan cloud spend cap (EUR); negative = no IDE cap (engine default). */
const CLOUD_COST_CAP_PREF = 'soriku.routing.cloudCostCapEur';

/** Which subagent overlay (Fase F5) is open, and the identifiers it needs. */
interface SubagentOverlayState {
    kind: 'insight' | 'promote' | 'spawn';
    planId: string;
    /** The minion's own persona id — set for insight/promote, not spawn (doesn't exist yet). */
    minionId?: string;
    /** The head agent's persona id — required for all three. */
    parentAgentId?: string;
    /** The minion's role — set for insight/promote; user-picked for spawn. */
    role?: string;
    /** Display name, for the overlay title. */
    name?: string;
}

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
    { value: 'edit', label: 'Edit', hint: 'Edit automatically — the agent acts and edits files directly.' },
    { value: 'plan', label: 'Plan', hint: 'Soriku drafts a plan you approve before anything runs.' },
    { value: 'chat', label: 'Chat', hint: 'Chat only — answer and discuss only, no file edits.' },
];

/** Which model(s) answer, independent of behaviour. */
type Orchestration = 'auto' | 'single' | 'ensemble';

interface OrchestrationOption {
    value: Orchestration;
    label: string;
    hint: string;
}

const ORCHESTRATION_OPTIONS: OrchestrationOption[] = [
    { value: 'auto', label: 'Auto', hint: 'Auto model — Soriku routes to the best model via the capability map.' },
    { value: 'single', label: 'Single', hint: 'Single model — use one specific model.' },
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
    { value: 'prefer_quality', label: 'Best', hint: 'Best quality — pick the best model regardless of locality or cost (cloud allowed).' },
];

/** Which model(s) author the PLAN itself, when behaviour is 'plan'. Independent of the answer-model pickers above. */
type PlanModelMode = 'auto' | 'single' | 'multi';

interface PlanModelModeOption {
    value: PlanModelMode;
    label: string;
    hint: string;
}

const PLAN_MODEL_MODE_OPTIONS: PlanModelModeOption[] = [
    { value: 'auto', label: 'Auto', hint: 'Auto model — the router picks a reasoning model to write the plan.' },
    { value: 'single', label: 'Single', hint: 'One model you pick writes the plan.' },
    { value: 'multi', label: 'Multi', hint: '2-3 models each draft a competing plan; the best one wins. Slower.' },
];

@injectable()
export class SorikuChatWidget extends ReactWidget {

    static readonly ID = 'soriku-chat';
    static readonly LABEL = 'Soriku Chat';

    @inject(EngineClient)
    protected readonly engineClient: EngineClient;

    @inject(SorikuAgentSelectionService)
    protected readonly selection: SorikuAgentSelectionService;

    @inject(SorikuDefaultAgentResolver)
    protected readonly defaultAgentResolver: SorikuDefaultAgentResolver;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SorikuToolConfirmationService)
    protected readonly toolConfirmation: SorikuToolConfirmationService;

    @inject(SorikuShellService)
    protected readonly shellService: SorikuShellService;

    @inject(ChatStreamController)
    protected readonly streamController: ChatStreamController;

    @inject(ChatSessionService)
    protected readonly session: ChatSessionService;

    @inject(SorikuToolApprovalBridge)
    protected readonly toolApproval: SorikuToolApprovalBridge;

    @inject(SorikuEditorRevealService)
    protected readonly editorReveal: SorikuEditorRevealService;

    @inject(SorikuGeneratedFilesTracker)
    protected readonly generatedFilesTracker: SorikuGeneratedFilesTracker;

    @inject(SorikuToastService)
    protected readonly toast: SorikuToastService;

    @inject(SorikuModelCatalog)
    protected readonly catalog: SorikuModelCatalog;

    @inject(SorikuConversationLink)
    protected readonly conversationLink: SorikuConversationLink;

    @inject(SorikuPlanLiveBridge)
    protected readonly planLiveBridge: SorikuPlanLiveBridge;

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

    // Session state lives in ChatSessionService (P4-b) — delegating accessors keep
    // the 40+ render references unchanged while the service is the single owner.
    protected get conversation(): ChatMessage[] {
        return this.session.conversation;
    }
    protected set conversation(value: ChatMessage[]) {
        this.session.conversation = value;
    }
    protected get feedbackByTurn(): Map<string, 'positive' | 'negative'> {
        return this.session.feedbackByTurn;
    }
    /** Fase E insights panel: what the active agent has learned. */
    protected insightsOpen = false;
    protected insights?: AgentInsights;
    protected insightsAgentId?: string;
    protected insightsLoading = false;
    protected get conversationId(): string | undefined {
        return this.session.conversationId;
    }
    protected set conversationId(value: string | undefined) {
        this.session.conversationId = value;
    }
    protected get conversationTitle(): string | undefined {
        return this.session.conversationTitle;
    }
    protected set conversationTitle(value: string | undefined) {
        this.session.conversationTitle = value;
    }
    protected inputRef = React.createRef<HTMLTextAreaElement>();
    protected fileInputRef = React.createRef<HTMLInputElement>();

    /** Images attached to the NEXT message (paste/drop/attach), cleared once sent. */
    protected pendingImages: ChatImageAttachment[] = [];
    protected dragOver = false;

    /** Phase 6.4: only the last DEFAULT_RENDER_WINDOW messages render by
     * default on a long conversation — "Show earlier" flips this to render
     * everything still in memory (capConversation already bounds that). */
    protected showEarlierMessages = false;

    /** Mic dictation state, backed by the real POST /api/v1/transcribe endpoint (core/voice) — no mock. */
    protected recording: 'idle' | 'recording' | 'transcribing' = 'idle';
    protected mediaRecorder: MediaRecorder | undefined;
    protected recordedChunks: Blob[] = [];

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
    /** Which model(s) author the plan itself (behavior === 'plan' only) — independent of the answer-model pickers above. */
    protected planModelMode: PlanModelMode = 'auto';
    protected planModelId = '';
    protected planModels: string[] = [];
    protected models: V1ModelDescriptor[] = [];
    protected providers: ProviderInfo[] = [];
    /** Plan id currently being approved/cancelled (to disable the buttons). */
    protected resolvingPlans = new Set<string>();
    /** User-edited task goals keyed by plan id, then task id. */
    protected planTaskEdits = new Map<string, Map<string, string>>();
    /** Plan id currently expanded into the full-size "Plan detail" overlay, if any. */
    protected expandedPlanId: string | undefined;
    /** Root-level mount for the Plan detail overlay (needs a full-viewport backdrop, not the docked chat panel's own box). */
    protected planDetailHost: HTMLDivElement | undefined;
    protected planDetailRoot: Root | undefined;
    /** Which subagent overlay (Insight / Promote / Spawn — Fase F5) is open, if any. Shares the same root as Plan detail — only one modal is ever open at a time. */
    protected subagentOverlay: SubagentOverlayState | undefined;
    protected subagentInsight: SubagentInsight | undefined;
    protected subagentPotential: SubagentPotential | undefined;
    protected subagentOverlayLoading = false;
    protected subagentOverlayError: string | undefined;
    protected spawnRole: string = SUBAGENT_ROLES[0];
    protected spawnGoal = '';
    protected spawning = false;
    /** Coalesce React re-renders during SSE streaming (Cursor-style ~60fps cap). */
    protected updateScheduled = false;
    /** Right-panel maximize toggle (Fase: header button fix) — `resize`/`expandPanel` are ApplicationShell's public API for side panels; `toggleMaximized` only supports main/bottom areas. */
    protected panelMaximized = false;
    protected panelWidthBeforeMaximize: number | undefined;

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
        this.toDispose.push(this.session.onDidChange(() => this.scheduleUpdate()));
        this.toDispose.push({ dispose: this.toolApproval.onPendingChange(() => this.scheduleUpdate()) });
        this.toDispose.push(this.generatedFilesTracker.onDidChange(() => this.scheduleUpdate()));
        // Closing the panel mid-stream must stop everything: abort the SSE loop (so it
        // no longer mutates state / executes delegated tools / writes files) and flush
        // any pending approvals so the engine stream isn't left blocked (#2/#1).
        this.toDispose.push({
            dispose: () => {
                this.mediaRecorder?.stop();
                this.streamController.abort();
                this.toolApproval.cancelAll();
            },
        });
        this.planDetailHost = document.createElement('div');
        this.planDetailHost.className = 'soriku-plan-detail-host';
        document.body.appendChild(this.planDetailHost);
        this.planDetailRoot = createRoot(this.planDetailHost);
        this.toDispose.push({
            dispose: () => {
                this.planDetailRoot?.unmount();
                this.planDetailHost?.remove();
            },
        });
        this.loadModels();
        this.loadProviders();
        this.restoreActiveChat();
        this.update();
    }

    /** Resume the last active conversation across IDE reloads. */
    protected async restoreActiveChat(): Promise<void> {
        const state = await this.session.restoreActiveChat();
        if (state?.conversationId) {
            await this.loadConversation(state.conversationId, state.agentId, state.agentName).catch(() => { /* stale id — ignore */ });
        }
        // The restore above may have re-selected the conversation's own agent; only
        // fall back to the default agent if that left nothing active (fresh start,
        // stale/missing pointer). Resolving BEFORE the restore settles would fire
        // onAgentChanged() and wipe the conversation being restored.
        if (!this.selection.getActiveId()) {
            await this.defaultAgentResolver.ensureActiveAgent();
            this.update();
        }
    }

    /** Load a stored conversation (messages + context) into the chat. */
    protected async loadConversation(id: string, agentIdHint?: string, agentNameHint?: string): Promise<void> {
        // Select the agent FIRST (guarded by `restoring` so it doesn't wipe the chat),
        // then let the session load state — same order as before the P4-b extraction.
        const personaId = await this.session.loadConversation(id);
        this.showEarlierMessages = false;
        const agentId = personaId ?? agentIdHint;
        this.restoring = true;
        try {
            if (agentId) {
                this.selection.setActive(agentId, agentNameHint);
            }
        } finally {
            this.restoring = false;
        }
        this.persistActiveChat();
        this.update();
    }

    /** Start a fresh conversation (keeps the active agent). */
    protected startNewConversation(): void {
        const hadMessages = this.conversation.length > 0;
        this.streamController.abort();
        this.session.reset();
        this.pendingImages = [];
        this.showEarlierMessages = false;
        void this.defaultAgentResolver.ensureActiveAgent();
        this.update();
        if (hadMessages) {
            this.toast.show('New chat');
        }
        requestAnimationFrame(() => this.inputRef.current?.focus());
    }

    /**
     * Maximize/restore the chat's right-side panel. Theia's `toggleMaximized` only
     * handles main/bottom-area widgets (silently no-ops for a right-area widget like
     * this one), so this resizes the panel directly via ApplicationShell's public
     * `expandPanel`/`resize` API instead of moving the widget between shell areas.
     */
    protected togglePanelMaximize(): void {
        this.shell.expandPanel('right');
        if (this.panelMaximized) {
            this.shell.resize(this.panelWidthBeforeMaximize ?? MIN_MAXIMIZED_WIDTH, 'right');
            this.panelMaximized = false;
        } else {
            this.panelWidthBeforeMaximize = this.node.clientWidth || undefined;
            this.shell.resize(maximizedPanelWidth(window.innerWidth), 'right');
            this.panelMaximized = true;
        }
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
        this.session.persistActiveChat(this.selection.getActiveId(), this.selection.getActiveName());
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
        this.insights = undefined;
        this.insightsAgentId = undefined;
        // Explicit agent switch starts fresh — forget the resumed pointer.
        this.session.reset();
        this.update();
    }

    protected nextId(): string {
        return this.session.nextId();
    }

    protected async toggleRecording(): Promise<void> {
        if (this.recording === 'recording') {
            this.mediaRecorder?.stop();
            return;
        }
        if (this.recording !== 'idle') {
            return;
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            this.messages.error(`Could not access the microphone: ${(e as Error).message}`);
            return;
        }
        this.recordedChunks = [];
        const recorder = new MediaRecorder(stream);
        this.mediaRecorder = recorder;
        recorder.ondataavailable = e => { if (e.data.size > 0) { this.recordedChunks.push(e.data); } };
        recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            this.mediaRecorder = undefined;
            this.transcribeRecording();
        };
        recorder.start();
        this.recording = 'recording';
        this.update();
    }

    protected async transcribeRecording(): Promise<void> {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.recordedChunks = [];
        this.recording = 'transcribing';
        this.update();
        try {
            const result = await this.engineClient.transcribeAudio(blob);
            const textarea = this.inputRef.current;
            if (textarea) {
                const sep = textarea.value && !textarea.value.endsWith(' ') ? ' ' : '';
                textarea.value = `${textarea.value}${sep}${result.text}`;
                textarea.focus();
            }
        } catch (e) {
            this.messages.error(`Transcription failed: ${(e as Error).message}`);
        } finally {
            this.recording = 'idle';
            this.update();
        }
    }

    /** Adds one dropped/pasted/attached image, downscaling it and enforcing the caps. */
    protected async addImageBlob(blob: Blob, name?: string): Promise<void> {
        if (blob.type && !isSupportedImageType(blob.type)) {
            this.messages.warn(`Unsupported image type: ${blob.type || 'unknown'}`);
            return;
        }
        const gate = canAddAttachment(this.pendingImages.length, blob.size);
        if (!gate.ok) {
            this.messages.warn(gate.reason ?? 'Could not attach that image.');
            return;
        }
        try {
            const attachment = await processImageBlob(blob, name);
            this.pendingImages.push(attachment);
            this.update();
        } catch (e) {
            this.messages.error((e as Error).message);
        }
    }

    protected removeImage(id: string): void {
        this.pendingImages = this.pendingImages.filter(a => a.id !== id);
        this.update();
    }

    protected onInputPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }
        for (const item of Array.from(items)) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    void this.addImageBlob(file, file.name);
                }
            }
        }
    }

    protected onChatDragOver(e: React.DragEvent<HTMLDivElement>): void {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            if (!this.dragOver) {
                this.dragOver = true;
                this.update();
            }
        }
    }

    protected onChatDragLeave(): void {
        if (this.dragOver) {
            this.dragOver = false;
            this.update();
        }
    }

    protected onChatDrop(e: React.DragEvent<HTMLDivElement>): void {
        e.preventDefault();
        this.dragOver = false;
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        for (const file of files) {
            void this.addImageBlob(file, file.name);
        }
        this.update();
    }

    protected onFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const files = Array.from(e.target.files ?? []);
        for (const file of files) {
            void this.addImageBlob(file, file.name);
        }
        e.target.value = '';
    }

    protected submitFromInput(): void {
        const textarea = this.inputRef.current;
        if (!textarea) {
            return;
        }
        const text = textarea.value;
        if (text.trim() || this.pendingImages.length > 0) {
            textarea.value = '';
            const images = this.pendingImages;
            this.pendingImages = [];
            this.send(text.trim(), images).catch(() => { /* errors are captured into the assistant turn */ });
        }
    }

    async send(text: string, images: ChatImageAttachment[] = []): Promise<void> {
        const agentId = this.selection.getActiveId() ?? await this.defaultAgentResolver.ensureActiveAgent();
        if (!agentId) {
            this.messages.error('No agent available — is the Soriku engine running?');
            return;
        }
        if (this.streaming) {
            return;
        }
        this.resolvingPlans.clear();
        const fileMentions = parseFileMentions(text);
        this.conversation.push({
            role: 'user',
            id: this.nextId(),
            text,
            fileMentions: fileMentions.length > 0 ? fileMentions : undefined,
            images: images.length > 0 ? images.map(({ base64, mimeType }) => ({ base64, mimeType })) : undefined,
        });
        const initialTurn = createAssistantTurn(this.nextId());
        const turnIndex = this.conversation.push(initialTurn) - 1;
        this.editorReveal.resetDedup();
        this.scheduleUpdate(true);
        const params = await this.buildStreamParams(text, agentId, images);
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
        // Phase 6.4: cap AFTER the turn is fully settled, never mid-stream —
        // capConversation can drop old messages and shift indices, which
        // would break the `this.conversation[turnIndex] = …` updates above
        // if applied while this turn is still streaming.
        this.conversation = capConversation(this.conversation);
        this.conversationLink.notifyChanged();
        this.scheduleUpdate(true);
    }

    /** Re-send the user message that produced an interrupted turn (#5, manual retry). */
    protected retryTurn(turnId: string): void {
        const turnIndex = this.conversation.findIndex(entry => entry.id === turnId);
        for (let i = turnIndex - 1; i >= 0; i--) {
            const entry = this.conversation[i];
            if (entry.role === 'user') {
                const images: ChatImageAttachment[] = (entry.images ?? []).map((img, idx) => ({
                    id: `retry-${turnId}-${idx}`, base64: img.base64, mimeType: 'image/jpeg', width: 0, height: 0,
                }));
                void this.send(entry.text, images);
                return;
            }
        }
    }

    /** Translate the two pickers (behaviour + models) into engine stream params. */
    protected async buildStreamParams(text: string, agentId: string, images: ChatImageAttachment[] = []): Promise<ChatStreamParams> {
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
            this.buildEditorContext(text, editsEnabled),
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
            images: images.length > 0 ? images.map(a => a.base64) : undefined,
            planModelId: this.behavior === 'plan' && this.planModelMode === 'single'
                && this.planModelId && this.modelAvailability(this.planModelId).ok
                ? this.planModelId : undefined,
            planModels: this.behavior === 'plan' && this.planModelMode === 'multi' && this.planModels.length >= 2
                ? this.planModels : undefined,
            allowMcp: this.behavior === 'plan'
                ? this.preferences.get<boolean>(SORIKU_PLAN_MCP, DEFAULT_PLAN_MCP)
                : undefined,
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
    protected async buildEditorContext(prompt: string, editsEnabled: boolean): Promise<import('soriku-engine-client-ext/lib/common/engine-types').ChatContextItem[]> {
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
        // Phase 2.8: when the agent can act (edits enabled), give it the
        // workspace layout up front instead of making it spend early
        // iterations on list_directory just to find out what's there.
        if (root && editsEnabled) {
            const tree = await this.buildWorkspaceTreeContext(root.path.toString());
            if (tree) {
                items.push(tree);
            }
        }
        for (const rel of parseFileMentions(prompt)) {
            items.push({ type: 'file', value: rel });
        }
        return items;
    }

    /** Best-effort — a backend hiccup here must never block sending the chat message. */
    protected async buildWorkspaceTreeContext(rootPath: string): Promise<import('soriku-engine-client-ext/lib/common/engine-types').ChatContextItem | undefined> {
        try {
            const entries = await this.shellService.listTree(rootPath, 200);
            if (entries.length === 0) {
                return undefined;
            }
            return { type: 'text', value: `Workspace file tree:\n${formatTree(entries)}` };
        } catch {
            return undefined;
        }
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
        this.renderPlanDetailPortal();
        const active = this.selection.getActive();
        const agentId = active.id;
        const agentName = active.name;
        const category = active.category ? toKnownCategory(active.category) : undefined;
        return <div
            className={`soriku-chat${this.dragOver ? ' soriku-chat-dragover' : ''}`}
            onDragOver={e => this.onChatDragOver(e)}
            onDragLeave={() => this.onChatDragLeave()}
            onDrop={e => this.onChatDrop(e)}
        >
            <div className='soriku-chat-header'>
                <div className='soriku-chat-header-main'>
                    {agentId
                        ? <span className='soriku-chat-agent-identity'>
                            <AgentAvatar initials={initials(agentName ?? agentId)} category={category ?? 'general'} size='sm' />
                            <span className='soriku-chat-agent'>{agentName ?? agentId}</span>
                            {category && <Badge tone='acc'>{category}</Badge>}
                        </span>
                        : <span className='soriku-chat-noagent'>No agent selected — pick one in the Agents panel.</span>}
                    {this.conversationTitle && <span className='soriku-chat-conv-title' title={this.conversationTitle}>{this.conversationTitle}</span>}
                </div>
                <div className='soriku-chat-header-actions'>
                    <button className='soriku-chat-header-icon-btn' title='History'
                        onClick={() => this.commands.executeCommand('soriku.conversations.open')}>
                        <span className='codicon codicon-history' />
                    </button>
                    <button className='soriku-chat-header-icon-btn' title='New chat'
                        disabled={this.streaming} onClick={() => this.startNewConversation()}>
                        <span className='codicon codicon-add' />
                    </button>
                    <button className='soriku-chat-header-icon-btn' title={this.panelMaximized ? 'Restore chat size' : 'Maximize chat'}
                        onClick={() => this.togglePanelMaximize()}>
                        <span className={`codicon ${this.panelMaximized ? 'codicon-screen-normal' : 'codicon-screen-full'}`} />
                    </button>
                    {/* Not part of the mockup's 3-icon header row (History/New chat/Maximize) —
                        a real, working feature (per-agent learned-pattern summary) kept as a
                        4th icon in the same minimal style rather than dropped, matching the
                        "Quick Actions" precedent of preserving real functionality without
                        reintroducing mockup-foreign chrome (labelled buttons, extra text). */}
                    {agentId && <button className='soriku-chat-header-icon-btn' title='What this agent has learned'
                        onClick={() => this.toggleInsights()}>
                        <span className='codicon codicon-lightbulb' />
                    </button>}
                </div>
            </div>
            {agentId && this.insightsOpen && this.renderInsights()}
            {agentId && this.renderControls()}
            <div className='soriku-chat-messages'>
                {this.conversation.length === 0
                    ? <div className='soriku-chat-empty'>Ask the agent a question to start.</div>
                    : <>
                        {!this.showEarlierMessages && this.conversation.length > DEFAULT_RENDER_WINDOW && <button
                            className='soriku-chat-show-earlier'
                            onClick={() => { this.showEarlierMessages = true; this.update(); }}
                        >
                            Show {this.conversation.length - DEFAULT_RENDER_WINDOW} earlier message{this.conversation.length - DEFAULT_RENDER_WINDOW === 1 ? '' : 's'}
                        </button>}
                        {visibleMessages(this.conversation, this.showEarlierMessages).map(message => this.renderMessage(message))}
                    </>}
            </div>
            {this.renderInlineToolApproval()}
            <div className='soriku-chat-input'>
                {this.pendingImages.length > 0 && <div className='soriku-chat-attachments'>
                    {this.pendingImages.map(a => <div key={a.id} className='soriku-chat-attachment'>
                        <img src={`data:${a.mimeType};base64,${a.base64}`} alt={a.name ?? 'attached image'} />
                        <button
                            className='soriku-chat-attachment-remove'
                            title='Remove image'
                            disabled={this.streaming}
                            onClick={() => this.removeImage(a.id)}
                        >
                            <span className='codicon codicon-close' />
                        </button>
                    </div>)}
                </div>}
                <textarea
                    ref={this.inputRef}
                    className='theia-input'
                    rows={3}
                    placeholder={agentId ? 'Message the agent…  (Enter to send, Shift+Enter for newline)' : 'Message Soriku…  (Enter to send, Shift+Enter for newline)'}
                    onPaste={e => this.onInputPaste(e)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            this.submitFromInput();
                        }
                    }}
                />
                <div className='soriku-chat-actions'>
                    <input
                        ref={this.fileInputRef}
                        type='file'
                        accept='image/png,image/jpeg,image/webp,image/gif'
                        multiple
                        style={{ display: 'none' }}
                        onChange={e => this.onFileInputChange(e)}
                    />
                    <Btn
                        variant='secondary'
                        title='Attach an image'
                        onClick={() => this.fileInputRef.current?.click()}
                    >
                        <span className='codicon codicon-attach' />
                    </Btn>
                    <Btn
                        variant={this.recording === 'recording' ? 'danger' : 'secondary'}
                        disabled={this.recording === 'transcribing'}
                        title={this.recording === 'recording' ? 'Stop recording' : 'Dictate a message'}
                        onClick={() => this.toggleRecording()}
                    >
                        <span className={`codicon ${this.recording === 'transcribing' ? 'codicon-loading codicon-modifier-spin' : 'codicon-mic'}`} />
                    </Btn>
                    {this.streaming
                        ? <Btn variant='secondary' onClick={() => this.stop()}>Stop</Btn>
                        : <Btn onClick={() => this.submitFromInput()}>Send</Btn>}
                </div>
            </div>
        </div>;
    }

    protected renderMessage(message: ChatMessage): React.ReactNode {
        if (message.role === 'user') {
            return <div key={message.id} className='soriku-msg soriku-msg-user'>
                {message.images && message.images.length > 0 && <div className='soriku-msg-images'>
                    {message.images.map((img, i) => <img key={i} src={`data:${img.mimeType};base64,${img.base64}`} alt='attached' />)}
                </div>}
                <div className='soriku-msg-text'>{message.text}</div>
                {message.fileMentions && message.fileMentions.length > 0 && <div className='soriku-msg-file-chips'>
                    {message.fileMentions.map(f => <Pill key={f}>{f}</Pill>)}
                </div>}
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
                    <Btn variant='secondary' onClick={() => this.commands.executeCommand('soriku.auth.connect')}>Sign in…</Btn>
                    <Btn variant='secondary' onClick={() => this.retryTurn(turn.id)}>Retry</Btn>
                </span>}
            </div>}
            {turn.status === 'interrupted' && <div className='soriku-msg-interrupted'>
                <span>Connection interrupted — partial answer kept.</span>
                <Btn variant='secondary' onClick={() => this.retryTurn(turn.id)}>Retry</Btn>
            </div>}
            {turn.status === 'done' && !turn.text && turn.phase === 'stopped' &&
                <div className='soriku-msg-stopped'>Stopped — no answer was generated.</div>}
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
                <button className='soriku-plan-expand' title='Expand plan detail'
                    onClick={() => { this.expandedPlanId = plan.planId; this.update(); }}>
                    <span className='codicon codicon-screen-full' />
                </button>
            </div>
            {this.renderPlanDocumentSection(plan)}
            {this.renderPlanTasksSection(plan, resolving)}
            {this.renderPlanActions(plan, resolving)}
        </div>;
    }

    /** The engine-rendered markdown plan document — reads first, Claude-Code style. Undefined for a plan loaded before this feature shipped (back-compat). */
    protected renderPlanDocumentSection(plan: PendingPlan): React.ReactNode {
        if (!plan.document) {
            return undefined;
        }
        return <div className='soriku-plan-document sk-scroll'>
            <ChatMarkdown text={plan.document} />
        </div>;
    }

    /** Once a document is shown, the editable task list moves into a collapsible section beneath it. */
    protected renderPlanTasksSection(plan: PendingPlan, resolving: boolean): React.ReactNode {
        if (!plan.document) {
            return this.renderPlanTaskList(plan, resolving);
        }
        return <details className='soriku-plan-tasks-details'>
            <summary>Tasks (editable)</summary>
            {this.renderPlanTaskList(plan, resolving)}
        </details>;
    }

    /** Shared with the full-size Plan detail overlay — same real data, same edit affordance. */
    protected renderPlanTaskList(plan: PendingPlan, resolving: boolean): React.ReactNode {
        return <ol className='soriku-plan-tasks'>
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
        </ol>;
    }

    protected renderPlanActions(plan: PendingPlan, resolving: boolean): React.ReactNode {
        return <div className='soriku-plan-actions'>
            <Btn disabled={resolving} onClick={() => this.approvePlan(plan.planId, plan.tasks)}>
                {resolving ? 'Starting…' : 'Approve & run'}
            </Btn>
            <Btn variant='secondary' disabled={resolving} onClick={() => this.cancelPlan(plan.planId)}>
                Cancel
            </Btn>
        </div>;
    }

    /**
     * Footer of the Plan Detail overlay — 1:1 from the mockup: a caption, then either
     * Approve/Cancel or a running-spinner state (no separate "Edit plan" button — every
     * task's goal is already directly editable inline in the task list above, so there's
     * no distinct edit mode to toggle into).
     */
    protected renderPlanDetailFooter(plan: PendingPlan, resolving: boolean): React.ReactNode {
        return <div className='soriku-plan-detail-footer'>
            <span className='soriku-plan-detail-footer-caption'>Local-first · nothing leaves this machine on Auto</span>
            <div className='soriku-plan-detail-footer-spacer' />
            {resolving
                ? <span className='soriku-plan-detail-running'>
                    <span className='soriku-plan-detail-spinner' />Running the full plan…
                </span>
                : this.renderPlanActions(plan, resolving)}
        </div>;
    }

    /** The turn (if any) still carrying the plan the user chose to expand. */
    protected findExpandedPlan(): AssistantTurn | undefined {
        if (!this.expandedPlanId) {
            return undefined;
        }
        return this.conversation.find(
            (m): m is AssistantTurn => m.role === 'assistant' && (m as AssistantTurn).pendingPlan?.planId === this.expandedPlanId,
        );
    }

    /**
     * Renders the Plan detail overlay into its own document-root React root — a
     * modal backdrop needs `position:absolute;inset:0` against the whole viewport,
     * which a node nested inside the docked chat panel cannot give it.
     */
    protected renderPlanDetailPortal(): void {
        if (this.subagentOverlay) {
            this.planDetailRoot?.render(this.renderSubagentOverlay());
            return;
        }
        const turn = this.findExpandedPlan();
        if (!turn?.pendingPlan) {
            this.expandedPlanId = undefined;
            // eslint-disable-next-line no-null/no-null
            this.planDetailRoot?.render(null);
            return;
        }
        const plan = turn.pendingPlan;
        const resolving = this.resolvingPlans.has(plan.planId);
        const close = (): void => { this.expandedPlanId = undefined; this.update(); };
        this.planDetailRoot?.render(
            <Overlay onClose={close} frameStyle={{ width: 680, maxWidth: '92vw', maxHeight: 'calc(100vh - 140px)' }}>
                <div className='soriku-plan-detail'>
                    <div className='soriku-plan-detail-header'>
                        <div className='soriku-plan-detail-header-row'>
                            <span className='soriku-plan-detail-title sk-em'>Execution plan</span>
                            <span className={`soriku-plan-detail-pill${resolving ? ' running' : ''}`}>{resolving ? 'Running' : 'Review'}</span>
                            <div className='soriku-plan-detail-header-spacer' />
                            <button className='soriku-plan-detail-close' onClick={close} title='Close'>
                                <span className='codicon codicon-close' />
                            </button>
                        </div>
                        <div className='soriku-plan-detail-meta'>
                            <span className='soriku-plan-detail-meta-mp'>
                                <span className='soriku-plan-detail-mp-badge'>MP</span>Generated by Master Planner
                            </span>
                            <span>·</span><span>{plan.tasks.length} task{plan.tasks.length === 1 ? '' : 's'}</span>
                            {typeof plan.costEur === 'number' && <><span>·</span><span>est. €{plan.costEur.toFixed(2)}</span></>}
                        </div>
                    </div>
                    <div className='soriku-plan-detail-banner'>
                        <b>How this was generated:</b> the Master Planner classified your prompt, pulled the capability map, and decomposed
                        the work into ordered, independently-verifiable tasks — each assigned to the cheapest capable model, local-first.
                        Review it, then run the whole plan or step through it.
                    </div>
                    <div className='soriku-plan-detail-body sk-scroll'>
                        {this.renderPlanDocumentSection(plan)}
                        {this.renderPlanTasksSection(plan, resolving)}
                    </div>
                    {this.renderPlanDetailFooter(plan, resolving)}
                </div>
            </Overlay>,
        );
    }

    // ── Subagents (minions) — Fase F5: Insight / Promote / Spawn ────────────

    /** Opens the Insight overlay for a Fleet minion row and loads its real data. */
    protected openSubagentInsight(a: AgentActivity, planId: string): void {
        if (!a.personaId) {
            return;
        }
        this.subagentOverlay = {
            kind: 'insight', planId, minionId: a.personaId,
            parentAgentId: a.parentAgentId, role: a.role,
        };
        this.subagentInsight = undefined;
        this.subagentPotential = undefined;
        this.subagentOverlayError = undefined;
        this.update();
        void this.loadSubagentInsight();
    }

    /** Opens the Spawn overlay for the given head agent's live plan run. */
    protected openSpawnSubagent(planId: string, parentAgentId: string): void {
        this.subagentOverlay = { kind: 'spawn', planId, parentAgentId };
        this.spawnRole = SUBAGENT_ROLES[0];
        this.spawnGoal = '';
        this.subagentOverlayError = undefined;
        this.update();
    }

    protected closeSubagentOverlay = (): void => {
        this.subagentOverlay = undefined;
        this.subagentInsight = undefined;
        this.subagentPotential = undefined;
        this.subagentOverlayError = undefined;
        this.update();
    };

    protected async loadSubagentInsight(): Promise<void> {
        const ov = this.subagentOverlay;
        if (!ov?.minionId) {
            return;
        }
        this.subagentOverlayLoading = true;
        this.update();
        try {
            this.subagentInsight = await this.engineClient.getSubagentInsight(ov.planId, ov.minionId, ov.parentAgentId);
            // Potential is best-effort (only available while the run is still live) —
            // its absence just hides the "flagged for potential" banner, never an error.
            try {
                this.subagentPotential = await this.engineClient.getSubagentPotential(ov.planId, ov.minionId, ov.parentAgentId);
            } catch {
                this.subagentPotential = undefined;
            }
        } catch (e) {
            this.subagentOverlayError = (e as Error).message;
        } finally {
            this.subagentOverlayLoading = false;
            this.update();
        }
    }

    /** Switches the open Insight overlay into the Promote overlay (same subagent). */
    protected openPromoteFromInsight(): void {
        if (this.subagentOverlay?.kind === 'insight') {
            this.subagentOverlay = { ...this.subagentOverlay, kind: 'promote' };
            this.update();
        }
    }

    protected async doPromoteSubagent(): Promise<void> {
        const ov = this.subagentOverlay;
        if (!ov?.minionId) {
            return;
        }
        this.subagentOverlayLoading = true;
        this.update();
        try {
            const persona = await this.engineClient.promoteSubagent(ov.minionId, ov.planId);
            this.toast.show(`${persona.name || ov.role || 'Subagent'} promoted to a full agent`);
            this.closeSubagentOverlay();
        } catch (e) {
            this.subagentOverlayError = (e as Error).message;
        } finally {
            this.subagentOverlayLoading = false;
            this.update();
        }
    }

    protected async doSpawnSubagent(): Promise<void> {
        const ov = this.subagentOverlay;
        if (!ov || ov.kind !== 'spawn' || !ov.parentAgentId || !this.spawnGoal.trim()) {
            return;
        }
        this.spawning = true;
        this.subagentOverlayError = undefined;
        this.update();
        try {
            const outcome: MinionSpawnOutcome = await this.engineClient.spawnSubagent(ov.planId, {
                role: this.spawnRole, goal: this.spawnGoal.trim(), parentAgentId: ov.parentAgentId,
            });
            if (outcome.status === 'error' || outcome.status === 'rejected') {
                this.subagentOverlayError = outcome.error || 'Could not spawn the subagent.';
                return;
            }
            this.toast.show(`Spawned ${roleLabel(this.spawnRole)} under ${this.selection.getActiveName() ?? 'the head agent'}`);
            this.closeSubagentOverlay();
        } catch (e) {
            this.subagentOverlayError = (e as Error).message;
        } finally {
            this.spawning = false;
            this.update();
        }
    }

    protected renderSubagentOverlay(): React.ReactElement {
        const ov = this.subagentOverlay!;
        if (ov.kind === 'spawn') {
            return <Overlay onClose={this.closeSubagentOverlay} frameStyle={{ width: 480, maxWidth: '92vw' }}>
                {this.renderSpawnSubagentBody()}
            </Overlay>;
        }
        if (ov.kind === 'promote') {
            return <Overlay onClose={this.closeSubagentOverlay} frameStyle={{ width: 560, maxWidth: '92vw' }}>
                {this.renderPromoteSubagentBody()}
            </Overlay>;
        }
        return <Overlay onClose={this.closeSubagentOverlay} frameStyle={{ width: 560, maxWidth: '92vw', maxHeight: 'calc(100vh - 140px)' }}>
            {this.renderSubagentInsightBody()}
        </Overlay>;
    }

    /**
     * Mockup's insight header shows the subagent's own given name, a summary
     * sentence, and its model, alongside role/meta. `SubagentInsight` (engine-
     * types.ts) has none of those fields — only role/runs/success_rate/
     * learned/patterns/feedback counts — so this deliberately keeps role-only
     * title and meta rather than fabricating a name, summary or model.
     */
    protected renderSubagentInsightBody(): React.ReactNode {
        const ov = this.subagentOverlay!;
        const insight = this.subagentInsight;
        const potential = this.subagentPotential;
        return <div className='soriku-subagent-insight'>
            <div className='soriku-subagent-insight-header'>
                <div className='soriku-subagent-insight-icon'><span className='codicon codicon-organization' /></div>
                <div className='soriku-subagent-insight-title'>
                    <div className='soriku-subagent-insight-name'>
                        <span>{roleLabel(ov.role ?? 'generalist')}</span>
                        <span className='soriku-subagent-insight-badge'>subagent</span>
                    </div>
                    <div className='soriku-subagent-insight-meta'>under {this.selection.getActiveName() ?? 'the head agent'}</div>
                </div>
                <button className='soriku-plan-detail-close' onClick={this.closeSubagentOverlay} title='Close'>
                    <span className='codicon codicon-close' />
                </button>
            </div>
            <div className='soriku-subagent-insight-body sk-scroll'>
                {this.subagentOverlayLoading && !insight && <div className='soriku-subagent-insight-loading'>Loading…</div>}
                {this.subagentOverlayError && <div className='soriku-subagent-insight-error'>{this.subagentOverlayError}</div>}
                {insight && <>
                    <div className='soriku-subagent-insight-stats'>
                        <div className='soriku-subagent-stat'>
                            <div className='soriku-subagent-stat-value'>{insight.runs}</div>
                            <div className='soriku-subagent-stat-label'>lifetime runs</div>
                        </div>
                        <div className='soriku-subagent-stat'>
                            <div className='soriku-subagent-stat-value soriku-subagent-stat-ok'>
                                {insight.success_rate === null ? '—' : `${Math.round(insight.success_rate * 100)}%`}
                            </div>
                            <div className='soriku-subagent-stat-label'>verify rate</div>
                        </div>
                    </div>
                    {insight.learned.length > 0 && <div className='soriku-subagent-section'>
                        <div className='soriku-subagent-section-title'>What it has learned</div>
                        {insight.learned.map((line, i) => <div key={i} className='soriku-subagent-learned-row'>
                            <span className='codicon codicon-check' />{line}
                        </div>)}
                    </div>}
                    {Object.keys(insight.patterns).length > 0 && <div className='soriku-subagent-section'>
                        <div className='soriku-subagent-section-title'>Decision patterns</div>
                        <div className='soriku-subagent-patterns'>
                            {Object.entries(insight.patterns).map(([k, v]) => <div key={k} className='soriku-subagent-pattern-row'>
                                <span>{k}</span><span>{v.toFixed(2)}</span>
                            </div>)}
                        </div>
                    </div>}
                </>}
            </div>
            {potential?.flagged && <div className='soriku-subagent-flagged'>
                <span className='codicon codicon-sparkle' />
                <div className='soriku-subagent-flagged-text'>The engine flagged this subagent as having <b>potential</b>.</div>
                <Btn onClick={() => this.openPromoteFromInsight()}>Promote…</Btn>
            </div>}
        </div>;
    }

    protected renderPromoteSubagentBody(): React.ReactNode {
        const ov = this.subagentOverlay!;
        const potential = this.subagentPotential;
        return <div className='soriku-subagent-promote'>
            <div className='soriku-subagent-promote-header'>
                <div className='soriku-subagent-promote-eyebrow'><span className='codicon codicon-sparkle' />Promotion</div>
                <div className='soriku-subagent-promote-title'>Promote <span className='sk-em'>{roleLabel(ov.role ?? 'generalist')}</span> to a full agent</div>
                <div className='soriku-subagent-promote-desc'>
                    The engine scores every subagent against three transparent thresholds. Soriku IDE only reads the result — it never decides eligibility itself.
                </div>
            </div>
            <div className='soriku-subagent-promote-thresholds'>
                {potential?.thresholds.map(t => <div key={t.key} className={`soriku-subagent-threshold${t.met ? ' met' : ''}`}>
                    <span className={`soriku-subagent-threshold-dot${t.met ? ' met' : ''}`} />
                    <div className='soriku-subagent-threshold-body'>
                        <div className='soriku-subagent-threshold-label'>{t.label}</div>
                        <div className='soriku-subagent-threshold-target'>target {t.target}</div>
                    </div>
                    <span className='soriku-subagent-threshold-value'>{t.value}</span>
                    <span className={`soriku-subagent-threshold-chip${t.met ? ' met' : ''}`}>{t.met ? 'met' : 'below'}</span>
                </div>)}
            </div>
            {this.subagentOverlayError && <div className='soriku-subagent-insight-error'>{this.subagentOverlayError}</div>}
            <div className='soriku-subagent-promote-actions'>
                <span className='soriku-subagent-promote-note'>
                    {potential?.eligible_to_promote ? 'All thresholds met — ready to promote.' : 'One threshold below target — you can still promote with an override.'}
                </span>
                <Btn variant='secondary' onClick={this.closeSubagentOverlay}>Cancel</Btn>
                <Btn disabled={this.subagentOverlayLoading}
                    onClick={() => this.doPromoteSubagent()}>
                    <span className='codicon codicon-arrow-up' />Promote to agent
                </Btn>
            </div>
        </div>;
    }

    protected renderSpawnSubagentBody(): React.ReactNode {
        return <div className='soriku-subagent-spawn'>
            <div className='soriku-subagent-spawn-header'>
                <div className='soriku-subagent-spawn-title'>Spawn a <span className='sk-em'>subagent</span></div>
                <div className='soriku-subagent-spawn-desc'>
                    Attach a focused minion under {this.selection.getActiveName() ?? 'the head agent'} for this run.
                    Pick a role and describe its task — it runs on a local model when possible.
                </div>
            </div>
            <div className='soriku-subagent-spawn-body'>
                <div className='soriku-subagent-spawn-label'>Role</div>
                <div className='soriku-subagent-spawn-roles'>
                    {SUBAGENT_ROLES.map(role => <button key={role}
                        className={`soriku-subagent-spawn-role${this.spawnRole === role ? ' active' : ''}`}
                        onClick={() => { this.spawnRole = role; this.update(); }}>
                        <span className='codicon codicon-organization' />
                        <span>{roleLabel(role)}</span>
                    </button>)}
                </div>
                <div className='soriku-subagent-spawn-label'>Task</div>
                <textarea
                    className='theia-input soriku-subagent-spawn-goal'
                    rows={3}
                    placeholder='What should this subagent do?'
                    value={this.spawnGoal}
                    onChange={e => { this.spawnGoal = e.target.value; this.update(); }}
                />
            </div>
            {this.subagentOverlayError && <div className='soriku-subagent-insight-error'>{this.subagentOverlayError}</div>}
            <div className='soriku-subagent-spawn-actions'>
                <Btn variant='secondary' onClick={this.closeSubagentOverlay}>Cancel</Btn>
                <Btn disabled={!this.spawnGoal.trim() || this.spawning}
                    onClick={() => this.doSpawnSubagent()}>
                    {this.spawning ? 'Spawning…' : 'Spawn'}
                </Btn>
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
                <SegmentedPicker
                    label='Do'
                    title={behavior.hint}
                    options={BEHAVIOR_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                    value={this.behavior}
                    disabled={this.streaming}
                    onChange={next => { this.behavior = next; this.update(); }}
                />
                <SegmentedPicker
                    label='Model'
                    title={orchestration.hint}
                    options={ORCHESTRATION_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                    value={this.orchestration}
                    disabled={this.streaming}
                    onChange={next => { this.orchestration = next; this.warmSelectedModel(); this.update(); }}
                />
                <SegmentedPicker
                    label='Route'
                    title={`Where compute runs · ${routing.hint}`}
                    options={ROUTING_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                    value={this.routingStrategy}
                    disabled={this.streaming}
                    onChange={next => { this.routingStrategy = next; this.update(); }}
                />
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
            {this.behavior === 'plan' && this.renderPlanModelControls()}
        </div>;
    }

    /** Which model(s) author the plan itself — separate from the answer-model pickers above (behaviour === 'plan' only). */
    protected renderPlanModelControls(): React.ReactNode {
        const planMode = PLAN_MODEL_MODE_OPTIONS.find(o => o.value === this.planModelMode) ?? PLAN_MODEL_MODE_OPTIONS[0];
        return <div className='soriku-control-row soriku-plan-model-row'>
            <SegmentedPicker
                label='Plan by'
                title={planMode.hint}
                options={PLAN_MODEL_MODE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                value={this.planModelMode}
                disabled={this.streaming}
                onChange={next => { this.planModelMode = next; this.update(); }}
            />
            {this.planModelMode === 'single' && <select
                className='theia-select soriku-model-select'
                title='Model that writes the plan'
                value={this.planModelId}
                disabled={this.streaming}
                onChange={e => { this.planModelId = e.target.value; this.update(); }}
            >
                <option value=''>{this.models.length ? 'Pick a model…' : 'No models available'}</option>
                {this.models.map(m => {
                    const avail = this.modelAvailability(m.id);
                    return <option key={m.id} value={m.id} disabled={!avail.ok}>
                        {m.id}{avail.ok ? '' : ` — ${avail.reason}`}
                    </option>;
                })}
            </select>}
            {this.planModelMode === 'multi' && <div className='soriku-worker-models'>
                <div className='soriku-worker-models-hint'>
                    {this.planModels.length >= 2
                        ? `${this.planModels.length} models will draft competing plans — slower`
                        : 'Tick 2-3 models to draft competing plans'}
                </div>
                <div className='soriku-model-checklist'>
                    {this.models.length === 0
                        ? <div className='soriku-worker-models-hint'>No models available</div>
                        : this.models.map(m => {
                            const avail = this.modelAvailability(m.id);
                            return <label key={m.id} className={`soriku-model-checkitem${avail.ok ? '' : ' unavailable'}`} title={avail.ok ? m.id : `${m.id} — ${avail.reason}`}>
                                <input
                                    type='checkbox'
                                    checked={this.planModels.includes(m.id)}
                                    disabled={this.streaming || !avail.ok}
                                    onChange={() => this.togglePlanModel(m.id)}
                                />
                                <span className='soriku-model-checklabel'>{m.id}{avail.ok ? '' : ` — ${avail.reason}`}</span>
                            </label>;
                        })}
                </div>
            </div>}
        </div>;
    }

    /** Toggle a model in the plan-drafting collaboration set. */
    protected togglePlanModel(modelId: string): void {
        this.planModels = this.planModels.includes(modelId)
            ? this.planModels.filter(id => id !== modelId)
            : [...this.planModels, modelId];
        this.update();
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
                const canSpawn = !!(turn.planId && a.personaId);
                return <React.Fragment key={a.workerId}>
                    {this.renderFleetRow(a, false, turn.planId)}
                    {(minions && minions.length > 0 || canSpawn) && <div className='soriku-fleet-minions'>
                        <div className='soriku-fleet-minions-head'>
                            <span className='codicon codicon-type-hierarchy-sub' />
                            <span>{subTitle} fleet · {minions?.length ?? 0}</span>
                            <div className='soriku-fleet-minions-spacer' />
                            {canSpawn && <button className='soriku-fleet-spawn-btn' title={`Spawn a ${subLabel.replace(/s$/, '')}`}
                                onClick={() => this.openSpawnSubagent(turn.planId!, a.personaId!)}>
                                <span className='codicon codicon-add' /> Spawn
                            </button>}
                        </div>
                        {minions?.map(m => this.renderFleetRow(m, true, turn.planId))}
                    </div>}
                </React.Fragment>;
            })}
        </div>;
    }

    /** One Fleet row. `nested` indents it as a minion under its head agent and makes it clickable (Insight overlay) once its plan run is known. */
    protected renderFleetRow(a: AgentActivity, nested = false, planId?: string): React.ReactNode {
        const label = a.agentName ?? a.role ?? a.personaId ?? a.workerId.slice(0, 8);
        const sub = a.agentName && a.role ? a.role : undefined;
        const clickable = nested && !!planId && !!a.personaId;
        return <div key={a.workerId}
            className={`soriku-fleet-row soriku-fleet-${a.status}${nested ? ' soriku-fleet-row-nested' : ''}${clickable ? ' soriku-fleet-row-clickable' : ''}`}
            title={clickable ? 'View subagent insight' : undefined}
            onClick={clickable ? () => this.openSubagentInsight(a, planId!) : undefined}
        >
            <span title={a.status}><StatusDot status={a.status} /></span>
            <span className='soriku-fleet-role' title={a.personaId ? `persona: ${a.personaId}` : a.workerId}>{label}</span>
            {sub && <span className='soriku-fleet-subrole'>{sub}</span>}
            {a.model && <span className='soriku-fleet-model'>{a.model}</span>}
            {a.files.length > 0 && <span className='soriku-fleet-files' title={a.files.join('\n')}>
                {a.files.length} file{a.files.length > 1 ? 's' : ''}
            </span>}
            {a.corrections > 0 && <span className='soriku-fleet-fix' title='Writes the engine blocked or recovered for this worker'>
                {a.corrections} fix
            </span>}
            {a.verdict && <span title={a.verdict.notes ?? ''}>
                <VerifyPill state={a.verdict.status === 'approved' ? 'verified' : 'fixing'} />
            </span>}
            {a.rework && <span title={a.rework.reason ?? ''}>
                <Badge tone='warn'>↻ rework{a.rework.targetTaskId ? ` ${a.rework.targetTaskId}` : ''}</Badge>
            </span>}
        </div>;
    }

    protected renderGeneratedFiles(turn: AssistantTurn): React.ReactNode {
        return <ul className='soriku-generated-files'>
            {turn.generatedFiles.map(file => {
                const diff = this.generatedFilesTracker.get(file.path);
                return <li key={file.path}>
                    <button className='soriku-generated-file' title={file.path}
                        onClick={() => this.openGeneratedFile(file.path)}>
                        <span className='codicon codicon-file' />
                        {file.filename ?? file.path.split('/').pop() ?? file.path}
                    </button>
                    {diff && <span className='soriku-generated-file-stats'>
                        <DiffBar added={diff.added} removed={diff.removed} />
                        <span className='soriku-generated-file-counts'>+{diff.added} −{diff.removed}</span>
                    </span>}
                </li>;
            })}
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
        await this.session.ingestLivePlanEvent(
            event,
            e => { void this.handleLiveActivity(e); },
            { agentId: this.selection.getActiveId(), agentName: this.selection.getActiveName() },
        );
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
                <Btn variant='secondary' onClick={() => this.respondToolApproval(false)}>Deny</Btn>
                <Btn onClick={() => this.respondToolApproval(true)}>Allow</Btn>
            </div>
        </div>;
    }

    protected respondToolApproval(approved: boolean): void {
        const remember = approved && this.approvalRememberSession;
        this.toolApproval.respond(approved, remember);
        if (remember) {
            this.toast.show('Allowed for this session');
        }
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
