/********************************************************************************
 * Soriku IDE — agent chat widget (SSE streaming, model transparency)
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { CommandRegistry, CommandService, MessageService, PreferenceService } from '@theia/core/lib/common';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { EngineClient } from 'soriku-engine-client-ext/lib/common/engine-client';
import { SorikuModelCatalog } from 'soriku-engine-client-ext/lib/browser/soriku-model-catalog';
import { SorikuConversationLink } from 'soriku-engine-client-ext/lib/browser/soriku-conversation-link';
import { SorikuPlanLiveBridge } from 'soriku-engine-client-ext/lib/browser/soriku-plan-live-bridge';
import {
    ChatStreamParams, MinionSpawnOutcome, ProviderInfo,
    SubagentInsight, SubagentPotential, V1ModelDescriptor,
} from 'soriku-engine-client-ext/lib/common/engine-types';
import { SorikuEditorContextCollector } from 'soriku-engine-client-ext/lib/browser/soriku-editor-context-collector';
import { buildEditorContextItems } from 'soriku-engine-client-ext/lib/common/editor-context';
import { SorikuAgentSelectionService } from 'soriku-agents-ext/lib/browser/soriku-agent-selection';
import { SorikuDefaultAgentResolver } from 'soriku-agents-ext/lib/browser/soriku-default-agent-resolver';
import { SorikuToolConfirmationService } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-confirmation-service';
import { SorikuToolApprovalBridge } from 'soriku-tools-bridge-ext/lib/browser/soriku-tool-approval-bridge';
import { SorikuEditorRevealService } from 'soriku-tools-bridge-ext/lib/browser/soriku-editor-reveal-service';
import { SorikuGeneratedFilesTracker } from 'soriku-tools-bridge-ext/lib/browser/soriku-generated-files-tracker';
import { SorikuCheckpointService } from 'soriku-tools-bridge-ext/lib/browser/soriku-checkpoint-service';
import { SorikuPlanDocService } from './soriku-plan-doc-service';
import { planMeta, planSlug, planTitle } from '../common/plan-doc';
import { SorikuProjectInstructionsService } from 'soriku-tools-bridge-ext/lib/browser/soriku-project-instructions-service';
import { SorikuInstructionsCommands } from 'soriku-tools-bridge-ext/lib/browser/soriku-project-instructions-contribution';
import { SorikuRunStateService } from 'soriku-engine-client-ext/lib/browser/soriku-run-state-service';
import { shouldRevealWrite } from 'soriku-tools-bridge-ext/lib/common/agent-activity';
import { SorikuShellService, formatTree } from 'soriku-tools-bridge-ext/lib/common/shell-service';
import { SORIKU_PLAN_MCP, DEFAULT_PLAN_MCP } from 'soriku-tools-bridge-ext/lib/browser/soriku-tools-preferences';
import { Badge, Btn, Overlay, StatusDot, VerifyPill } from 'soriku-theme-ext/lib/browser/ui';
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
    PlanTaskView,
    UserMessage,
    roleLabel,
    SUBAGENT_ROLES,
    busyPhase,
    capConversation,
    chatTitle,
    createAssistantTurn,
    formatToolCallSummary,
    parseFileMentions,
    summarizeAgentInsights,
    visibleMessages,
    withWorkspacePrefix,
} from '../common/chat-model';
import { clockTime, formatDuration, historyTitle, modelLine, plural, relativeTime } from '../common/chat-format';
import { EditAction, EditChoice, editActions, needsDecision } from '../common/message-edit';
import {
    ChatModeChoice, DEFAULT_MODE, DEFAULT_MODEL, ModelSelection, RoutingChoice, placeholderFor, resolveRun, toggleMultiple,
} from '../common/mode-model';
import { RunState, claimsUnwrittenFiles, deriveRunState, deriveSteps, runStateSnapshot, runStats, shortPath, toolKind } from '../common/run-timeline';
import { ChatHeader, HistoryEntry } from './components/ChatHeader';
import { InstructionsBanner } from './components/InstructionsBanner';
import { rightEdgeRect, showChatDropZone } from './chat-drop-zone';
import { UserBubble } from './components/UserBubble';
import { PlanCard, PlanTodoView } from './components/PlanCard';
import { ApprovalView, RunTimeline, StepDetail } from './components/RunTimeline';
import { PastBanner, PausedBanner, RunBar, RunSummary } from './components/RunSummary';
import { Composer, ModelRow } from './components/Composer';
import { ThumbDownIcon, ThumbUpIcon } from './components/chat-icons';

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

    @inject(SorikuCheckpointService)
    protected readonly checkpoints: SorikuCheckpointService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(SorikuRunStateService)
    protected readonly runState: SorikuRunStateService;

    @inject(SorikuProjectInstructionsService)
    protected readonly projectInstructions: SorikuProjectInstructionsService;

    @inject(SorikuPlanDocService)
    protected readonly planDoc: SorikuPlanDocService;

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

    /** One stream at a time — backed by the controller (P4-a), so there is a single source of truth. */
    protected get streaming(): boolean {
        return this.streamController.active;
    }

    /** Composer pickers (v2): Mode pill + Model pill. Defaults: Plan, Auto / local-first. */
    protected mode: ChatModeChoice = DEFAULT_MODE;
    protected modelSel: ModelSelection = DEFAULT_MODEL;
    protected lastSingleModel: string | undefined;
    protected popMenu: 'mode' | 'model' | undefined;
    protected draftHasText = false;
    protected models: V1ModelDescriptor[] = [];
    protected providers: ProviderInfo[] = [];

    // ── v2 chat view state ──
    protected histOpen = false;
    protected history: HistoryEntry[] | undefined;
    protected planOpen = true;
    protected expandedStep: string | undefined;
    /** Plans the user paused (run bar "Stop" / editing) — shown with the Paused banner + Resume. */
    protected pausedPlans = new Set<string>();
    protected editingId: string | undefined;
    protected editDraft = '';
    /** The run was live when editing started, so cancelling the edit resumes it. */
    protected editWasRunning = false;
    /** The edit awaiting the revert-or-continue choice. */
    protected pendingEdit: { id: string; text: string } | undefined;
    /** The live conversation, parked while a past session is shown (v2 "Back to current run"). */
    protected liveStash: { conversation: ChatMessage[]; conversationId?: string; title?: string } | undefined;
    protected pastWhen = '';
    protected tabMaximized = false;
    /** Distinguishes this IDE session's runs: the `m4`-style turn ids restart at every launch, so a bare turn id would reuse a checkpoint file. */
    protected readonly sessionStamp = Date.now().toString(36);
    /** Promise of the running send(), so edit/restart flows can wait for the old run to settle. */
    protected currentRun: Promise<void> | undefined;
    /** Plan id currently being approved/cancelled (to disable the buttons). */
    protected resolvingPlans = new Set<string>();
    /** User-edited task goals keyed by plan id, then task id. */
    protected planTaskEdits = new Map<string, Map<string, string>>();
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
        this.toDispose.push(this.checkpoints.onDidChange(() => this.scheduleUpdate()));
        this.toDispose.push(this.projectInstructions.onDidChange(() => this.scheduleUpdate()));
        // Closing the panel mid-stream must stop everything: abort the SSE loop (so it
        // no longer mutates state / executes delegated tools / writes files) and flush
        // any pending approvals so the engine stream isn't left blocked (#2/#1).
        this.toDispose.push({
            dispose: () => {
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
        this.liveStash = undefined;
        this.pastWhen = '';
        this.editingId = undefined;
        this.pendingEdit = undefined;
        this.pausedPlans.clear();
        this.expandedStep = undefined;
        this.histOpen = false;
        void this.defaultAgentResolver.ensureActiveAgent();
        this.update();
        if (hadMessages) {
            this.toast.show('New chat');
        }
        requestAnimationFrame(() => this.inputRef.current?.focus());
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
            textarea.style.height = 'auto';
            this.draftHasText = false;
            this.popMenu = undefined;
            const images = this.pendingImages;
            this.pendingImages = [];
            this.send(text.trim(), images).catch(() => { /* errors are captured into the assistant turn */ });
        }
    }

    async send(
        text: string,
        images: ChatImageAttachment[] = [],
        opts: { wirePrompt?: string; silentUser?: boolean; edited?: boolean } = {},
    ): Promise<void> {
        const agentId = this.selection.getActiveId() ?? await this.defaultAgentResolver.ensureActiveAgent();
        if (!agentId) {
            this.messages.error('No agent available — is the Soriku engine running?');
            return;
        }
        if (this.streaming) {
            return;
        }
        this.resolvingPlans.clear();
        this.expandedStep = undefined;
        if (!opts.silentUser) {
            const fileMentions = parseFileMentions(text);
            this.conversation.push({
                role: 'user',
                id: this.nextId(),
                text,
                at: Date.now(),
                edited: opts.edited ? true : undefined,
                fileMentions: fileMentions.length > 0 ? fileMentions : undefined,
                images: images.length > 0 ? images.map(({ base64, mimeType }) => ({ base64, mimeType })) : undefined,
            });
        }
        const initialTurn: AssistantTurn = {
            ...createAssistantTurn(this.nextId()), auto: this.modelSel.kind === 'auto', agentMode: resolveRun(this.mode, this.modelSel).editsEnabled,
        };
        const turnIndex = this.conversation.push(initialTurn) - 1;
        this.editorReveal.resetDedup();
        // Agent writes during this run are checkpointed so "Undo all" can restore them.
        this.checkpoints.beginRun(this.runKey(initialTurn.id));
        this.scheduleUpdate(true);
        // After an edit/restart the conversation array can be replaced while this run is
        // still unwinding; only write into the slot if it still holds OUR turn.
        const write = (turn: AssistantTurn): void => {
            if (this.conversation[turnIndex]?.id === initialTurn.id) {
                this.conversation[turnIndex] = turn;
            }
        };
        const run = (async (): Promise<void> => {
            try {
                const params = await this.buildStreamParams(opts.wirePrompt ?? text, agentId, images);
                // The controller owns the lifecycle (P4-a): abort, reduce, typed errors,
                // tool/plan fan-out. This widget only renders the turns it hands back.
                const finalTurn = await this.streamController.run({
                    params,
                    initialTurn,
                    needsApproval: params.mode === 'plan',
                    tools: this.toolConfirmation,
                    isDisposed: () => this.isDisposed,
                    onTurn: (turn, event) => {
                        write(turn);
                        if (turn.conversationId && turn.conversationId !== this.conversationId) {
                            this.conversationId = turn.conversationId;
                            this.persistActiveChat();
                        }
                        void this.handleLiveActivity(event);
                        this.scheduleUpdate();
                    },
                });
                write(finalTurn);
            } finally {
                this.checkpoints.endRun();
            }
            // Phase 6.4: cap AFTER the turn is fully settled, never mid-stream —
            // capConversation can drop old messages and shift indices, which would
            // break the slot writes above if applied while this turn is still streaming.
            if (this.conversation[turnIndex]?.id === initialTurn.id) {
                this.conversation = capConversation(this.conversation);
            }
            this.conversationLink.notifyChanged();
            this.scheduleUpdate(true);
        })();
        this.currentRun = run;
        try {
            await run;
        } finally {
            if (this.currentRun === run) {
                this.currentRun = undefined;
            }
        }
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

    /** Translate the v2 pickers (Mode + Model) into engine stream params. */
    protected async buildStreamParams(text: string, agentId: string, images: ChatImageAttachment[] = []): Promise<ChatStreamParams> {
        const run = resolveRun(this.mode, this.modelSel);
        const [projectId, editorContext] = await Promise.all([
            this.workspaceProjectId(),
            this.buildEditorContext(text, run.editsEnabled),
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
            mode: run.mode,
            context: editorContext,
            clientTools: run.editsEnabled ? this.toolConfirmation.delegatedTools() : undefined,
            toolsEnabled: run.editsEnabled ? undefined : false,
            modelId: run.modelId,
            workerModels: run.workerModels,
            planAutoExecute: run.planAutoExecute,
            routingStrategy: run.routingStrategy,
            cloudCostCapEur: this.getCloudCostCap(),
            images: images.length > 0 ? images.map(a => a.base64) : undefined,
            allowMcp: run.mode === 'plan' ? this.preferences.get<boolean>(SORIKU_PLAN_MCP, DEFAULT_PLAN_MCP) : undefined,
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
        // Project instructions (soriku.md): only text the user approved, re-read right now so an edit
        // made a second ago is included. The engine does not read it from its own disk.
        await this.projectInstructions.refresh();
        const instructions = this.projectInstructions.getTextForRequest();
        if (instructions) {
            items.push({ type: 'instructions', value: instructions });
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

    /** Stop for good: stops the engine plan (if any) and aborts the stream, then waits for the run to settle. */
    protected async stopRun(): Promise<void> {
        const planId = this.lastAssistant()?.planId;
        if (planId) {
            await this.engineClient.stopPlan(planId).catch(() => { /* the abort below ends the stream either way */ });
        }
        this.streamController.abort();
        this.toolApproval.cancelAll();
        await this.currentRun?.catch(() => { /* errors are captured into the turn */ });
    }

    /** Run bar "Stop" (v2): pauses a plan run so it can be resumed; a plain agent run is aborted. */
    protected pauseRun(): void {
        const planId = this.lastAssistant()?.planId;
        if (!planId) {
            this.streamController.abort();
            return;
        }
        this.pausedPlans.add(planId);
        this.engineClient.pausePlan(planId).catch(e => {
            this.pausedPlans.delete(planId);
            this.messages.warn(`Could not pause the run: ${(e as Error).message}`);
            this.update();
        });
        this.update();
    }

    protected resumeRun(): void {
        const planId = this.lastAssistant()?.planId;
        if (!planId) {
            return;
        }
        this.pausedPlans.delete(planId);
        this.engineClient.resumePlan(planId).catch(e => this.messages.warn(`Could not resume the run: ${(e as Error).message}`));
        this.update();
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

    // ═══ v2 chat: helpers ══════════════════════════════════════════════════════

    /** Keep the view pinned to the newest content unless the user scrolled up. */
    protected scrollEl: HTMLDivElement | undefined;

    protected override onUpdateRequest(msg: Message): void {
        const el = this.scrollEl;
        const stick = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        super.onUpdateRequest(msg);
        if (stick) {
            requestAnimationFrame(() => {
                if (this.scrollEl) {
                    this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
                }
            });
        }
    }

    /** Fire-and-forget for UI handlers: failures are shown instead of becoming unhandled rejections. */
    protected fire(promise: PromiseLike<unknown>): void {
        Promise.resolve(promise).catch(e => this.messages.error((e as Error).message));
    }

    protected runKey(turnId: string): string {
        return `${this.sessionStamp}-${turnId}`;
    }

    protected lastAssistant(): AssistantTurn | undefined {
        for (let i = this.conversation.length - 1; i >= 0; i--) {
            const m = this.conversation[i];
            if (m.role === 'assistant') {
                return m;
            }
        }
        return undefined;
    }

    protected isPaused(turn: AssistantTurn): boolean {
        return !!turn.planId && this.pausedPlans.has(turn.planId) && turn.status === 'streaming';
    }

    /** The assistant turn that answers the user message with this id. */
    protected followingTurn(userId: string): AssistantTurn | undefined {
        const i = this.conversation.findIndex(m => m.id === userId);
        const next = i >= 0 ? this.conversation[i + 1] : undefined;
        return next && next.role === 'assistant' ? next : undefined;
    }

    protected isLastUser(userId: string): boolean {
        const i = this.conversation.findIndex(m => m.id === userId);
        return i >= 0 && !this.conversation.slice(i + 1).some(m => m.role === 'user');
    }

    protected isLocalModel(id: string): boolean {
        const known = this.models.find(m => m.id === id);
        if (known && typeof known.is_local === 'boolean') {
            return known.is_local;
        }
        const prefix = id.includes(':') ? id.slice(0, id.indexOf(':')) : '';
        return !this.providers.some(p => !p.is_local && p.name === prefix);
    }

    protected modelRows(): ModelRow[] {
        return this.models.map(m => {
            const avail = this.modelAvailability(m.id);
            const local = this.isLocalModel(m.id);
            return { id: m.id, local, ok: avail.ok, tag: avail.ok ? (local ? 'local' : 'cloud') : (avail.reason ?? 'unavailable') };
        });
    }

    /** Opens a file the agent touched; relative paths resolve against the workspace root. */
    protected async openFilePath(path: string): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0]?.resource;
        const absolute = path.startsWith('/') || !root ? path : root.resolve(path).path.toString();
        await this.openGeneratedFile(absolute);
    }

    protected get placement(): 'dock' | 'tab' {
        return this.shell.getAreaFor(this) === 'main' ? 'tab' : 'dock';
    }

    protected get maximized(): boolean {
        return this.placement === 'tab' ? this.tabMaximized : this.panelMaximized;
    }

    // ═══ v2 chat: handlers ═════════════════════════════════════════════════════

    /** Dock ⇄ editor tab: moves THIS widget between areas, so its state is kept. */
    protected async togglePlacement(): Promise<void> {
        if (this.placement === 'tab') {
            await this.shell.addWidget(this, { area: 'right', rank: 200 });
            this.shell.expandPanel('right');
            this.tabMaximized = false;
        } else {
            this.panelMaximized = false;
            await this.shell.addWidget(this, { area: 'main', mode: 'tab-after' });
        }
        await this.shell.activateWidget(this.id);
        this.update();
    }

    /** Header drag: offer the other placement as a drop zone (v2 "Drop to open chat as a tab" / "Dock chat to the side"). */
    protected removeDropZone: (() => void) | undefined;

    protected onHeaderDragStart(e: React.DragEvent<HTMLDivElement>): void {
        e.dataTransfer.setData('text/plain', 'soriku-chat');
        e.dataTransfer.effectAllowed = 'move';
        const toTab = this.placement === 'dock';
        const main = document.getElementById('theia-main-content-panel')?.getBoundingClientRect();
        const top = main?.top ?? 42;
        // Added on the next tick: showing it synchronously cancels the drag in some browsers.
        window.setTimeout(() => {
            this.removeDropZone?.();
            this.removeDropZone = showChatDropZone({
                rect: toTab && main ? { left: main.left, top: main.top, width: main.width, height: main.height }
                    : rightEdgeRect(window.innerWidth, window.innerHeight, top),
                label: toTab ? 'Drop to open chat as a tab' : 'Dock chat to the side',
                onDrop: () => { this.onHeaderDragEnd(); this.fire(this.togglePlacement()); },
            });
        }, 0);
    }

    protected onHeaderDragEnd(): void {
        this.removeDropZone?.();
        this.removeDropZone = undefined;
    }

    protected toggleMaximize(): void {
        if (this.placement === 'tab') {
            this.shell.toggleMaximized(this);
            this.tabMaximized = !this.tabMaximized;
            this.update();
            return;
        }
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

    protected async toggleHistory(): Promise<void> {
        this.histOpen = !this.histOpen;
        this.update();
        if (!this.histOpen) {
            return;
        }
        try {
            const all = await this.engineClient.listConversations();
            const project = await this.workspaceProjectId();
            const scoped = all.filter(c => !c.project_id || !project || c.project_id === project);
            const list = (scoped.length > 0 ? scoped : all).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
            this.history = list.map(c => ({
                id: c.id,
                title: historyTitle(c.title),
                sub: plural(c.message_count, 'message'),
                time: relativeTime(c.created_at),
                on: c.id === this.conversationId,
            }));
        } catch {
            this.history = [];
        }
        this.update();
    }

    protected openHistory(id: string): void {
        this.histOpen = false;
        if (id === this.conversationId) {
            this.update();
            return;
        }
        if (this.streaming) {
            // The running turn writes into the live conversation; swapping it now would corrupt the past view.
            this.toast.show('Stop the current run before opening another chat');
            this.update();
            return;
        }
        if (!this.liveStash && this.conversation.length > 0) {
            this.liveStash = { conversation: this.conversation, conversationId: this.conversationId, title: this.conversationTitle };
        }
        this.pastWhen = this.history?.find(h => h.id === id)?.time ?? '';
        this.loadConversation(id).catch(e => this.messages.error(`Could not open conversation: ${(e as Error).message}`));
    }

    protected backToLive(): void {
        const stash = this.liveStash;
        if (!stash) {
            return;
        }
        this.conversation = stash.conversation;
        this.conversationId = stash.conversationId;
        this.conversationTitle = stash.title;
        this.liveStash = undefined;
        this.pastWhen = '';
        this.persistActiveChat();
        this.update();
    }

    protected setMode(mode: ChatModeChoice): void {
        this.mode = mode;
        this.update();
    }

    protected setModelTab(kind: ModelSelection['kind']): void {
        const routing: RoutingChoice = this.modelSel.kind === 'auto' ? this.modelSel.routing : 'local_first';
        if (this.modelSel.kind === 'single') {
            this.lastSingleModel = this.modelSel.modelId;
        }
        this.modelSel = kind === 'auto' ? { kind: 'auto', routing }
            : kind === 'single' ? { kind: 'single', modelId: this.lastSingleModel }
                : { kind: 'multiple', modelIds: [] };
        this.update();
    }

    protected setRouting(routing: RoutingChoice): void {
        this.modelSel = { kind: 'auto', routing };
        this.update();
    }

    protected pickModel(id: string): void {
        if (this.modelSel.kind === 'multiple') {
            this.modelSel = { kind: 'multiple', modelIds: toggleMultiple(this.modelSel.modelIds, id) };
        } else {
            this.modelSel = { kind: 'single', modelId: id };
            this.lastSingleModel = id;
            this.popMenu = undefined;
            this.warmSelectedModel();
        }
        this.update();
    }

    /** Opportunistically preload the picked local model to cut first-token latency. */
    protected warmSelectedModel(): void {
        if (this.modelSel.kind !== 'single' || !this.modelSel.modelId) {
            return;
        }
        const id = this.modelSel.modelId;
        if (!this.modelAvailability(id).ok || !this.isLocalModel(id)) {
            return;
        }
        const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
        this.engineClient.warmModel(bare).catch(() => { /* best-effort */ });
    }

    protected onComposerInput(): void {
        const ta = this.inputRef.current;
        if (!ta) {
            return;
        }
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
        ta.style.overflowY = ta.scrollHeight > 200 ? 'auto' : 'hidden';
        const has = ta.value.trim().length > 0;
        if (has !== this.draftHasText) {
            this.draftHasText = has;
            this.update();
        }
    }

    // ── message editing (v2: edit, then revert-or-continue) ──

    protected startEdit(id: string): void {
        const m = this.conversation.find(x => x.id === id);
        if (!m || m.role !== 'user' || this.editingId || this.pendingEdit) {
            return;
        }
        this.editingId = id;
        this.editDraft = m.text;
        this.editWasRunning = this.streaming && this.isLastUser(id);
        if (this.editWasRunning) {
            this.pauseRun();   // v2: "Run paused while you edit"
        }
        this.update();
    }

    protected cancelEdit(): void {
        const resume = this.editWasRunning;
        this.editingId = undefined;
        this.pendingEdit = undefined;
        this.editWasRunning = false;
        if (resume) {
            this.resumeRun();
        }
        this.update();
    }

    protected editContext(userId: string): { running: boolean; hasChanges: boolean } {
        const turn = this.followingTurn(userId);
        return { running: !!turn && turn.status === 'streaming', hasChanges: !!turn && this.checkpoints.hasChanges(this.runKey(turn.id)) };
    }

    protected saveEdit(): void {
        const id = this.editingId;
        const text = this.editDraft.trim();
        if (!id || !text) {
            return;
        }
        const idx = this.conversation.findIndex(m => m.id === id);
        this.editingId = undefined;
        if (this.isLastUser(id) && needsDecision(this.editContext(id))) {
            this.pendingEdit = { id, text };   // the revert-or-continue card takes over
            this.update();
            return;
        }
        this.editWasRunning = false;
        this.restartFrom(idx, text).catch(() => { /* captured into the turn */ });
        this.update();
    }

    protected resolveEdit(choice: EditChoice): void {
        const pending = this.pendingEdit;
        if (!pending) {
            return;
        }
        const idx = this.conversation.findIndex(m => m.id === pending.id);
        const actions = editActions(choice, pending.text, this.editContext(pending.id));
        this.pendingEdit = undefined;
        this.editWasRunning = false;
        this.update();
        this.runEditActions(actions, idx, pending.id).catch(e => this.messages.error(`Edit failed: ${(e as Error).message}`));
    }

    protected async runEditActions(actions: EditAction[], idx: number, userId: string): Promise<void> {
        const turn = this.followingTurn(userId);
        for (const action of actions) {
            if (action.kind === 'stop_run') {
                await this.stopRun();
            } else if (action.kind === 'undo_checkpoint' && turn) {
                const outcome = await this.checkpoints.undo(this.runKey(turn.id));
                this.toast.show(`Restored ${plural(outcome.restored, 'file')}`);
                if (outcome.refused.length > 0 || outcome.failed.length > 0) {
                    this.messages.warn(`${outcome.refused.length + outcome.failed.length} file(s) could not be restored.`);
                }
            } else if (action.kind === 'send' && action.mode === 'restart') {
                await this.restartFrom(idx, action.text);
            } else if (action.kind === 'send') {
                // amend: the user's bubble becomes the edited text; agents get a follow-up turn on top of the finished work
                const original = this.conversation[idx];
                if (original?.role === 'user') {
                    const shown = this.pendingEditText(action.text, original.text);
                    this.conversation[idx] = { ...original, text: shown, edited: true };
                }
                await this.send(this.conversation[idx]?.role === 'user' ? (this.conversation[idx] as UserMessage).text : action.text,
                    [], { wirePrompt: action.text, silentUser: true });
            }
        }
    }

    /** For an amend turn the visible bubble should show the user's own edit, not the instruction wrapper. */
    protected pendingEditText(wire: string, fallback: string): string {
        const marker = 'Updated instruction:\n';
        const i = wire.indexOf(marker);
        return i >= 0 ? wire.slice(i + marker.length) : fallback;
    }

    /** Replace the user message at `idx` (and everything after it) with an edited one and run it again. */
    protected async restartFrom(idx: number, text: string): Promise<void> {
        if (this.streaming) {
            await this.stopRun();
        }
        const original = this.conversation[idx];
        const images: ChatImageAttachment[] = original?.role === 'user'
            ? (original.images ?? []).map((img, i) => ({ id: `edit-${i}`, base64: img.base64, mimeType: 'image/jpeg' as const, width: 0, height: 0 }))
            : [];
        this.conversation = this.conversation.slice(0, idx);
        this.pausedPlans.clear();
        this.update();
        await this.send(text, images, { edited: true });
    }

    // ── approvals, checkpoints ──

    protected respondToolApproval(approved: boolean, remember = false): void {
        this.toolApproval.respond(approved, approved && remember);
        if (approved && remember) {
            this.toast.show('Allowed for this session');
        }
        this.scheduleUpdate(true);
    }

    protected async undoRun(turnId: string): Promise<void> {
        const outcome = await this.checkpoints.undo(this.runKey(turnId));
        this.toast.show(`Restored ${plural(outcome.restored, 'file')}`);
        if (outcome.refused.length > 0 || outcome.failed.length > 0) {
            this.messages.warn(`${outcome.refused.length + outcome.failed.length} file(s) could not be restored.`);
        }
    }

    // ═══ v2 chat: render ═══════════════════════════════════════════════════════

    protected render(): React.ReactNode {
        this.renderPlanDetailPortal();
        const active = this.selection.getActive();
        const agentId = active.id;
        const viewingPast = !!this.liveStash;
        const lastTurn = this.lastAssistant();
        const messages = visibleMessages(this.conversation, this.showEarlierMessages);
        const chip = viewingPast ? { label: 'Past', cls: 'sk-chip-past' } : this.chipFor(lastTurn);
        const streamingTurn = lastTurn && lastTurn.status === 'streaming' ? lastTurn : undefined;
        // The status bar mirrors the latest run (publish de-duplicates, so doing it per render is cheap).
        this.runState.publish(runStateSnapshot(lastTurn));
        this.syncPlanDoc(lastTurn);
        // As an editor tab the chat is labelled with its conversation (v2), not a generic name.
        const label = chatTitle(this.conversationTitle, this.conversation);
        const tabLabel = this.conversation.length > 0 ? label : SorikuChatWidget.LABEL;
        if (this.title.label !== tabLabel) {
            this.title.label = tabLabel;
        }
        const paused = !!streamingTurn && this.isPaused(streamingTurn);
        return <div
            className={`sk-chat${this.dragOver ? ' sk-chat-dragover' : ''}`}
            onDragOver={e => this.onChatDragOver(e)}
            onDragLeave={() => this.onChatDragLeave()}
            onDrop={e => this.onChatDrop(e)}
        >
            <ChatHeader
                title={label}
                chipLabel={chip.label}
                chipClass={chip.cls}
                history={this.history}
                histOpen={this.histOpen}
                onToggleHist={() => this.fire(this.toggleHistory())}
                onOpenHistory={id => this.openHistory(id)}
                onAllConversations={() => { this.histOpen = false; this.update(); this.fire(this.commands.executeCommand('soriku.conversations.open')); }}
                onNew={() => this.startNewConversation()}
                newDisabled={this.streaming}
                placement={this.placement}
                onPlacement={() => this.fire(this.togglePlacement())}
                maxed={this.maximized}
                onMax={() => this.toggleMaximize()}
                onInsights={agentId ? () => this.fire(this.toggleInsights()) : undefined}
                onDragStart={e => this.onHeaderDragStart(e)}
                onDragEnd={() => this.onHeaderDragEnd()}
            />
            {agentId && this.insightsOpen && this.renderInsights()}
            <div className='sk-chat-scroll sk-scroll' ref={el => { this.scrollEl = el ?? undefined; }}>
                <div className='sk-chat-stack'>
                    {viewingPast && <PastBanner when={this.pastWhen} onBack={() => this.backToLive()} />}
                    {this.projectInstructions.getState().status === 'review' && <InstructionsBanner
                        files={this.projectInstructions.getState().files}
                        hasApprovedVersion={!!this.projectInstructions.getTextForRequest()}
                        signals={this.projectInstructions.getState().signals}
                        onOpen={() => this.fire(this.commands.executeCommand(SorikuInstructionsCommands.OPEN.id))}
                        onApprove={() => this.fire(this.commands.executeCommand(SorikuInstructionsCommands.APPROVE.id))}
                    />}
                    {this.conversation.length === 0 && <div className='sk-empty'>
                        {agentId ? 'Ask the agent a question to start.' : 'No agent selected — pick one in the Agents panel.'}
                    </div>}
                    {!this.showEarlierMessages && this.conversation.length > DEFAULT_RENDER_WINDOW && <button
                        className='sk-show-earlier'
                        onClick={() => { this.showEarlierMessages = true; this.update(); }}
                    >
                        Show {this.conversation.length - DEFAULT_RENDER_WINDOW} earlier message{this.conversation.length - DEFAULT_RENDER_WINDOW === 1 ? '' : 's'}
                    </button>}
                    {messages.map(m => m.role === 'user'
                        ? this.renderUser(m, viewingPast)
                        : this.renderAssistantBlock(m, m === lastTurn))}
                </div>
            </div>
            <div className='sk-chat-foot'>
                {streamingTurn && !paused && !this.shouldShowApproval(streamingTurn) && this.renderRunBar(streamingTurn)}
                <Composer
                    inputRef={this.inputRef}
                    fileInputRef={this.fileInputRef}
                    placeholder={placeholderFor(this.mode, viewingPast)}
                    hasText={this.draftHasText}
                    sending={this.streaming}
                    attachments={this.pendingImages.map(a => ({ id: a.id, src: `data:${a.mimeType};base64,${a.base64}`, name: a.name }))}
                    onRemoveAttachment={id => this.removeImage(id)}
                    onAttachClick={() => this.fileInputRef.current?.click()}
                    onFileInput={e => this.onFileInputChange(e)}
                    onPaste={e => this.onInputPaste(e)}
                    onInput={() => this.onComposerInput()}
                    onSend={() => this.submitFromInput()}
                    mode={this.mode}
                    onMode={m => this.setMode(m)}
                    model={this.modelSel}
                    onModelTab={k => this.setModelTab(k)}
                    onRouting={r => this.setRouting(r)}
                    onPickModel={id => this.pickModel(id)}
                    models={this.modelRows()}
                    popMenu={this.popMenu}
                    onPop={m => { this.popMenu = m; this.update(); }}
                    onManageModels={() => this.fire(this.commands.executeCommand('soriku.models.open'))}
                />
            </div>
        </div>;
    }

    protected chipFor(turn: AssistantTurn | undefined): { label: string; cls: string } {
        if (!turn) {
            return { label: '', cls: '' };
        }
        const state: RunState = deriveRunState(turn, { paused: this.isPaused(turn) });
        switch (state) {
            case 'plan_ready': return { label: 'Plan ready', cls: '' };
            case 'running': return { label: 'Running', cls: 'sk-chip-running' };
            case 'needs_you': return { label: 'Needs you', cls: 'sk-chip-needs' };
            case 'paused': return { label: 'Paused', cls: 'sk-chip-paused' };
            case 'done': return { label: 'Done', cls: 'sk-chip-done' };
            case 'failed': return { label: 'Failed', cls: 'sk-chip-failed' };
            default: return { label: 'Ready', cls: '' };
        }
    }

    protected renderRunBar(turn: AssistantTurn): React.ReactNode {
        const steps = deriveSteps(turn).filter(st => st.id !== 'plan');
        const waiting = steps.find(st => st.status === 'waiting') ?? undefined;
        const current = [...steps].reverse().find(st => st.status === 'active');
        const text = this.toolApproval.pending || waiting
            ? 'Waiting for you to approve a command'
            : current ? `${current.verbActive} ${current.target ?? ''}`.trim() : busyPhase(turn);
        const todos = this.planTodos(turn);
        const count = todos.length > 0 ? `${todos.filter(t => t.done).length} / ${todos.length}` : steps.length > 0 ? plural(steps.length, 'step') : '';
        return <RunBar waiting={!!(this.toolApproval.pending || waiting)} text={text} count={count}
            stopLabel='Stop' onStop={() => this.pauseRun()} />;
    }

    protected renderUser(m: UserMessage, viewingPast: boolean): React.ReactNode {
        const editing = this.editingId === m.id;
        const pending = this.pendingEdit?.id === m.id;
        const turn = this.followingTurn(m.id);
        const lastUser = this.isLastUser(m.id);
        const cp = turn ? this.checkpoints.get(this.runKey(turn.id)) : undefined;
        const changed = cp ? Object.keys(cp.files).length : 0;
        const finished = !!turn && turn.status !== 'streaming';
        const worked = changed > 0 || !!turn?.toolCalls.length;
        const editHint = !lastUser ? 'Replies after this message will be regenerated.'
            : this.editWasRunning ? 'Run paused while you edit · ⌘⏎ to save'
                : worked ? '⌘⏎ to save · you\'ll choose to revert or continue' : '⌘⏎ to save';
        const decision = pending ? {
            sub: changed > 0
                ? `${changed} ${changed === 1 ? 'file was' : 'files were'} changed after this message${finished ? ' and the run finished.' : '.'}`
                : 'The run is still in progress.',
            revertDesc: changed > 0
                ? `Undo those changes, restore the checkpoint${cp ? ` from ${clockTime(Date.parse(cp.createdAt))}` : ''} and re-plan from your edited message.`
                : 'Stop the run and start again from your edited message.',
            onRevert: () => this.resolveEdit('revert'),
            onContinue: () => this.resolveEdit('continue'),
            onDiscard: () => this.cancelEdit(),
        } : undefined;
        return <UserBubble
            key={m.id}
            message={pending ? { ...m, text: this.pendingEdit!.text } : m}
            time={clockTime(m.at)}
            edited={!!m.edited || pending}
            editing={editing}
            draft={this.editDraft}
            editHint={editHint}
            canEdit={!viewingPast && !this.pendingEdit && !this.editingId && (!this.streaming || lastUser)}
            pending={pending}
            decision={decision}
            onStartEdit={() => this.startEdit(m.id)}
            onDraft={v => { this.editDraft = v; this.update(); }}
            onCancel={() => this.cancelEdit()}
            onSave={() => this.saveEdit()}
        />;
    }

    /** Plan tasks as to-dos: done when their worker finished, active = first unfinished while the run is live. */
    protected planTodos(turn: AssistantTurn): PlanTodoView[] {
        const plan = turn.pendingPlan;
        if (!plan) {
            return [];
        }
        const live = turn.status === 'streaming' && !this.shouldShowApproval(turn) && !this.isPaused(turn);
        let activeSet = false;
        return plan.tasks.map(t => {
            const done = turn.status === 'done' || turn.agents.some(a => a.taskId === t.id && a.status === 'done');
            const active = !done && live && !activeSet;
            if (active) {
                activeSet = true;
            }
            return { id: t.id, goal: this.getPlanTaskGoal(plan.planId, t.id, t.goal), done, active };
        });
    }

    protected stepDetails(turn: AssistantTurn): Record<string, StepDetail> {
        const out: Record<string, StepDetail> = {};
        turn.toolCalls.forEach((call: ChatToolCall, i) => {
            const id = call.callId ?? `call-${i}`;
            const kind = toolKind(call.tool);
            if (kind === 'shell' && typeof call.result === 'string' && call.result) {
                out[id] = { body: call.result };
            } else if (kind === 'edit') {
                const summary = formatToolCallSummary(call);
                if (summary.preview) {
                    out[id] = { body: summary.preview, openPath: summary.subtitle };
                } else if (summary.subtitle) {
                    out[id] = { body: summary.subtitle, openPath: summary.subtitle };
                }
            }
        });
        return out;
    }

    protected renderAssistantBlock(turn: AssistantTurn, isLast: boolean): React.ReactNode {
        const steps = deriveSteps(turn).filter(st => st.id !== 'plan');
        const stats = runStats(turn, steps);
        const todos = this.planTodos(turn);
        const awaiting = this.shouldShowApproval(turn);
        const paused = this.isPaused(turn);
        const pending = isLast ? this.toolApproval.pending : undefined;
        const waitingStep = [...steps].reverse().find(st => st.status === 'waiting');
        const approval: ApprovalView | undefined = pending ? (() => {
            const isShell = waitingStep?.kind === 'shell';
            return {
                stepId: waitingStep?.id,
                command: isShell ? (waitingStep?.command ?? pending.view.message) : pending.view.message,
                prompt: isShell ? '$' : '',
                askText: isShell ? `${waitingStep?.agent ?? 'Agent'} wants to run this` : pending.view.title,
                onSkip: () => this.respondToolApproval(false),
                onAlways: () => this.respondToolApproval(true, true),
                onRun: () => this.respondToolApproval(true),
            };
        })() : undefined;
        const plan = turn.pendingPlan;
        const local = turn.model ? this.isLocalModel(turn.model) : undefined;
        const line = modelLine(turn.model, !!turn.auto, local);
        const cp = this.checkpoints.get(this.runKey(turn.id));
        const hasCheckpoint = !!cp && Object.keys(cp.files).length > 0;
        const vote = this.feedbackByTurn.get(turn.id);
        const reported = new Set(turn.generatedFiles.map(f => f.path));
        const files = [
            ...turn.generatedFiles.map(f => {
                const diff = this.generatedFilesTracker.get(f.path);
                return { path: f.path, name: f.filename ?? shortPath(f.path), add: diff?.added ?? f.added, del: diff?.removed ?? f.removed };
            }),
            // Delegated writes are not echoed back as generated_files; the checkpoint knows every file the agent wrote.
            ...(cp ? Object.keys(cp.files).map(key => new URI(key).path.toString()).filter(path => !reported.has(path)).map(path => {
                const diff = this.generatedFilesTracker.get(path);
                return { path, name: shortPath(path), add: diff?.added, del: diff?.removed };
            }) : []),
        ];
        const worked = turn.status === 'done' && (files.length > 0 || steps.some(st => st.kind === 'edit' || st.kind === 'shell'));
        const failed = stats.verified === 'failed' || steps.some(st => st.tone === 'danger');
        const summaryStats = [
            ...(stats.agents > 0 ? [plural(stats.agents, 'agent')] : []),
            plural(stats.steps, 'step'),
            ...(stats.verified === 'verified' ? ['verified'] : stats.verified === 'failed' ? ['verification failed'] : []),
            ...(typeof plan?.costEur === 'number' ? [`est. €${plan.costEur.toFixed(2)}`] : []),
        ];
        const compare = !!turn.workers.length && turn.workers.length > 1;
        return <div key={turn.id} className='sk-stack-block' style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {(turn.text || line) && <div className='sk-assistant'>
                {turn.text && <div className='sk-assistant-text'><ChatMarkdown text={turn.text} streaming={turn.status === 'streaming'} /></div>}
                {line && <div className='sk-model-line'><span className={`sk-model-dot${local === false ? ' sk-model-dot-cloud' : ''}`} />{line}</div>}
            </div>}
            {plan && <PlanCard
                todos={todos}
                open={this.planOpen}
                onToggle={() => { this.planOpen = !this.planOpen; this.update(); }}
                onOpenPlan={() => this.openPlanTab()}
                approve={awaiting ? {
                    costLabel: typeof plan.costEur === 'number'
                        ? (plan.costEur === 0 ? 'Runs locally · €0.00' : `est. €${plan.costEur.toFixed(2)}`)
                        : 'Review before it runs',
                    resolving: this.resolvingPlans.has(plan.planId),
                    onReview: () => this.openPlanTab(),
                    onApprove: () => this.approvePlan(plan.planId, plan.tasks),
                } : undefined}
            />}
            {turn.agents.length > 0 && !this.commandRegistry.getCommand('soriku.agentsPanel.toggle') && this.renderFleet(turn)}
            {steps.length > 0 && <RunTimeline
                steps={steps}
                details={this.stepDetails(turn)}
                expanded={this.expandedStep}
                onToggle={id => { this.expandedStep = this.expandedStep === id ? undefined : id; this.update(); }}
                onOpenFile={path => this.fire(this.openFilePath(path))}
                approval={approval}
            />}
            {approval && steps.length === 0 && <RunTimeline steps={[]} details={{}} expanded={undefined} onToggle={() => undefined}
                onOpenFile={() => undefined} approval={approval} />}
            {turn.status === 'streaming' && !turn.text && steps.length === 0 && !awaiting && !approval && !plan && <div className='sk-thinking'>
                <span className='sk-spin' />{compare ? `${turn.workers.length} models are answering…` : busyPhase(turn) || 'Thinking…'}
            </div>}
            {paused && <PausedBanner onResume={() => this.resumeRun()} />}
            {worked && <RunSummary
                title={files.length > 0 ? `${plural(files.length, 'file')} changed` : 'Done'}
                warn={failed}
                time={formatDuration(turn.totalMs)}
                stats={summaryStats}
                files={files}
                onOpenFile={path => this.fire(this.openFilePath(path))}
                vote={vote}
                onVote={v => this.fire(this.submitFeedback(turn, v))}
                checkpoint={hasCheckpoint ? {
                    kept: cp!.state === 'kept',
                    undone: cp!.state === 'undone',
                    onUndo: () => this.fire(this.undoRun(turn.id)),
                    onKeep: () => this.fire(this.checkpoints.keep(this.runKey(turn.id))),
                    onRestore: () => this.fire(this.undoRun(turn.id)),
                } : undefined}
            />}
            {turn.status === 'done' && !worked && turn.text && <div className='sk-meta' style={{ gap: 2 }}>
                <button className={`sk-vote${vote === 'positive' ? ' on' : ''}`} title='Good response'
                    onClick={() => this.fire(this.submitFeedback(turn, 'positive'))}><ThumbUpIcon /></button>
                <button className={`sk-vote${vote === 'negative' ? ' on' : ''}`} title='Bad response'
                    onClick={() => this.fire(this.submitFeedback(turn, 'negative'))}><ThumbDownIcon /></button>
            </div>}
            {claimsUnwrittenFiles(turn, files.length) && <div className='sk-notice sk-notice-warn'>
                The reply says files were created or changed, but nothing was written to your workspace. The model only described the work.
                <div style={{ marginTop: 8 }}><button className='sk-btn' onClick={() => this.retryTurn(turn.id)}>Retry</button></div>
            </div>}
            {turn.status === 'error' && <div className='sk-notice sk-notice-error'>
                {turn.error}
                {turn.authRequired && <span>
                    <button className='sk-btn' onClick={() => this.commands.executeCommand('soriku.auth.connect')}>Sign in…</button>
                    <button className='sk-btn' onClick={() => this.retryTurn(turn.id)}>Retry</button>
                </span>}
            </div>}
            {turn.status === 'interrupted' && <div className='sk-notice sk-notice-info'>
                Connection interrupted — partial answer kept.
                <button className='sk-btn' onClick={() => this.retryTurn(turn.id)}>Retry</button>
            </div>}
            {turn.status === 'done' && !turn.text && turn.phase === 'stopped' &&
                <div className='sk-notice sk-notice-info'>Stopped — no answer was generated.</div>}
            {turn.status === 'done' && !turn.text && turn.phase !== 'stopped' && !worked && !plan &&
                <div className='sk-notice sk-notice-info'>
                    The agent finished without an answer{steps.some(st => st.status === 'error') ? ' — some of its actions were refused or failed.' : '.'}
                    <button className='sk-btn' onClick={() => this.retryTurn(turn.id)}>Retry</button>
                </div>}
        </div>;
    }

    /** Opens the plan as a document tab next to the code (v2 "Open plan ↗" / "Review full plan"). */
    protected openPlanTab(): void {
        this.fire(this.planDoc.open());
    }

    /** Keeps the plan tab in step with the newest turn's plan; undefined clears it. */
    protected syncPlanDoc(turn: AssistantTurn | undefined): void {
        const plan = turn?.pendingPlan;
        if (!turn || !plan) {
            if (this.planDoc.get()) {
                this.planDoc.set(undefined);
            }
            return;
        }
        const state = deriveRunState(turn, { paused: this.isPaused(turn) });
        const userIdx = this.conversation.findIndex(m => m === turn) - 1;
        const user = userIdx >= 0 ? this.conversation[userIdx] : undefined;
        const title = planTitle(plan.document, user?.role === 'user' ? user.text : undefined);
        const todos = this.planTodos(turn);
        this.planDoc.set({
            planId: plan.planId,
            title,
            slug: planSlug(title),
            meta: planMeta({ createdAt: user?.role === 'user' ? user.at : undefined, tasks: plan.tasks.length, costEur: plan.costEur, clock: clockTime }),
            document: plan.document,
            todos: todos.map(t => ({ ...t, role: plan.tasks.find(x => x.id === t.id)?.role, model: plan.tasks.find(x => x.id === t.id)?.model })),
            state: state === 'plan_ready' ? 'review' : state === 'paused' ? 'paused' : state === 'done' ? 'done' : state === 'failed' ? 'failed' : 'running',
            resolving: this.resolvingPlans.has(plan.planId),
            onEditGoal: (taskId, goal) => { this.setPlanTaskGoal(plan.planId, taskId, goal); this.scheduleUpdate(true); },
            onApprove: () => this.approvePlan(plan.planId, plan.tasks),
            onCancel: () => this.cancelPlan(plan.planId),
        });
    }

    protected shouldShowApproval(turn: AssistantTurn): boolean {
        return !!turn.planNeedsApproval && !!turn.awaitingApproval && !!turn.pendingPlan && turn.status === 'streaming';
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
        // eslint-disable-next-line no-null/no-null
        this.planDetailRoot?.render(null);
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

    /** Public entry for the Agents panel: open the Insight overlay for a minion of the latest run. */
    openSubagentInsightFor(planId: string, workerId: string): void {
        const agent = this.lastAssistant()?.agents.find(a => a.workerId === workerId);
        if (agent) {
            this.openSubagentInsight(agent, planId);
        }
    }

    /** Public entry for the Agents panel: open the Spawn overlay under a head agent. */
    openSpawnSubagentFor(planId: string, parentAgentId: string): void {
        this.openSpawnSubagent(planId, parentAgentId);
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

}
