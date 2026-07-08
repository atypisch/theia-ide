/********************************************************************************
 * Soriku IDE — EngineClient service contract
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import {
    AddProviderRequest,
    AddProviderResponse,
    AgentCreateRequest,
    AgentDeleteResponse,
    AgentFeedbackRequest,
    AgentFeedbackResponse,
    AgentListResponse,
    AgentResponse,
    AgentUpdateRequest,
    AuthModeResponse,
    BillingPlansResponse,
    BillingPortalResponse,
    BrowseModelsResponse,
    CapabilityMapResponse,
    ChatStreamParams,
    CompleteRequest,
    CompleteResponse,
    ConfirmRequest,
    ConfirmResponse,
    ConversationDetail,
    ConversationSummary,
    AgentPersona,
    CreateCheckoutRequest,
    CreateCheckoutResponse,
    DeleteRoutingOverrideResponse,
    DiscoverModelsResponse,
    ExecutePlanRequest,
    HealthResponse,
    TranscribeResponse,
    InlineEditRequest,
    InlineEditResponse,
    InstalledModelsResponse,
    MinionSpawnOutcome,
    ModelMutationResponse,
    PlanSignalResponse,
    ProviderPresetsResponse,
    ProvidersResponse,
    McpServersResponse,
    McpPutResponse,
    McpServer,
    McpTestResponse,
    RecommendedRoutingResponse,
    RenameConversationResponse,
    RoutingGapsResponse,
    RoutingOverridesResponse,
    SetRoutingOverrideRequest,
    SetRoutingOverrideResponse,
    SorikuSseEvent,
    SpawnMinionRequest,
    SubagentInsight,
    SubagentPotential,
    UserProvidersResponse,
    V1ModelsResponse,
    WhoamiResponse,
} from './engine-types';

export const EngineClient = Symbol('EngineClient');

export interface EngineClient {
    /** Current resolved base URL (from preferences). */
    getBaseUrl(): string;

    ping(): Promise<HealthResponse>;
    getAuthMode(): Promise<AuthModeResponse>;
    whoami(): Promise<WhoamiResponse>;

    /** Real speech-to-text via core/voice (POST /api/v1/transcribe) — no mock/local fallback. */
    transcribeAudio(audio: Blob, language?: string, signal?: AbortSignal): Promise<TranscribeResponse>;

    // ── Billing / subscription (Fase 6) ──
    getBillingPlans(): Promise<BillingPlansResponse>;
    /** Opens a Simezu-hosted checkout for a plan upgrade; caller opens the returned URL in a browser. */
    createCheckout(body: CreateCheckoutRequest): Promise<CreateCheckoutResponse>;
    /** Opens the Simezu billing/account portal; caller opens the returned URL in a browser. */
    getBillingPortal(): Promise<BillingPortalResponse>;

    listAgents(): Promise<AgentListResponse>;
    getAgent(agentId: string): Promise<AgentResponse>;
    createAgent(body: AgentCreateRequest): Promise<AgentResponse>;
    updateAgent(agentId: string, body: AgentUpdateRequest): Promise<AgentResponse>;
    deleteAgent(agentId: string): Promise<AgentDeleteResponse>;

    chatStream(params: ChatStreamParams, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent>;
    confirmTool(body: ConfirmRequest): Promise<ConfirmResponse>;
    /** Inline (fill-in-the-middle) code completion for editor ghost-text. */
    complete(body: CompleteRequest): Promise<CompleteResponse>;
    /** ⌘K inline edit: proposes review-able hunks for a selection/cursor + instruction. */
    proposeInlineEdit(body: InlineEditRequest): Promise<InlineEditResponse>;
    /** Resume a plan parked after `plan_awaiting_execution` (multi-worker / ensemble). */
    executePlan(planId: string, body?: ExecutePlanRequest): Promise<PlanSignalResponse>;
    /** Cancel a plan parked after `plan_awaiting_execution` before any worker runs. */
    cancelPlan(planId: string): Promise<PlanSignalResponse>;

    // ── Subagents (minions) — Fase F5 ──
    /** Durable insight for a subagent (role stats + its own feedback history); `parentAgentId` is required once the originating plan run has ended. */
    getSubagentInsight(planId: string, minionId: string, parentAgentId?: string): Promise<SubagentInsight>;
    /** Promotion criteria for a subagent — only while its plan run is still active. */
    getSubagentPotential(planId: string, minionId: string, parentAgentId?: string): Promise<SubagentPotential>;
    /** Manually promote a subagent early; the engine re-verifies real eligibility itself. */
    promoteSubagent(subagentId: string, planId: string): Promise<AgentPersona>;
    /** Spawn a new subagent under the given head agent, attached to its live plan run. */
    spawnSubagent(planId: string, body: SpawnMinionRequest): Promise<MinionSpawnOutcome>;

    getCapabilities(): Promise<CapabilityMapResponse>;
    getRoutingGaps(): Promise<RoutingGapsResponse>;
    listRoutingOverrides(): Promise<RoutingOverridesResponse>;
    setRoutingOverride(body: SetRoutingOverrideRequest): Promise<SetRoutingOverrideResponse>;
    deleteRoutingOverride(category: string): Promise<DeleteRoutingOverrideResponse>;
    getRecommendedRouting(): Promise<RecommendedRoutingResponse>;
    listModels(): Promise<V1ModelsResponse>;
    /** Providers with live health (key valid, credits, reachable) for availability checks. */
    listProviders(): Promise<ProvidersResponse>;

    // ── External MCP servers (client) ──
    listMcpServers(): Promise<McpServersResponse>;
    putMcpServers(servers: McpServer[], enabled?: boolean): Promise<McpPutResponse>;
    testMcpServer(server: McpServer): Promise<McpTestResponse>;

    // ── Model management (mirrors the Soriku install) ──
    listInstalledModels(): Promise<InstalledModelsResponse>;
    pullModel(name: string, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent>;
    deleteModel(modelId: string): Promise<ModelMutationResponse>;
    activateModel(modelId: string): Promise<ModelMutationResponse>;
    deactivateModel(modelId: string): Promise<ModelMutationResponse>;
    browseModels(query: string): Promise<BrowseModelsResponse>;
    /** Fire-and-forget warm-load of a local model into VRAM (reduces TTFT). */
    warmModel(modelId: string): Promise<ModelMutationResponse>;

    // ── Conversation history ──
    listConversations(): Promise<ConversationSummary[]>;
    getConversation(id: string): Promise<ConversationDetail>;
    deleteConversation(id: string): Promise<ModelMutationResponse>;
    renameConversation(id: string, title: string): Promise<RenameConversationResponse>;

    // ── Provider management ──
    listProviderPresets(): Promise<ProviderPresetsResponse>;
    listUserProviders(): Promise<UserProvidersResponse>;
    addProvider(body: AddProviderRequest): Promise<AddProviderResponse>;
    deleteUserProvider(providerId: string): Promise<ModelMutationResponse>;
    discoverProviderModels(baseUrl: string, apiKey?: string): Promise<DiscoverModelsResponse>;

    sendAgentFeedback(agentId: string, body: AgentFeedbackRequest): Promise<AgentFeedbackResponse>;
}
