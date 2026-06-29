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
    BrowseModelsResponse,
    CapabilityMapResponse,
    ChatStreamParams,
    CompleteRequest,
    CompleteResponse,
    ConfirmRequest,
    ConfirmResponse,
    ConversationDetail,
    ConversationSummary,
    DeleteRoutingOverrideResponse,
    DiscoverModelsResponse,
    ExecutePlanRequest,
    HealthResponse,
    InstalledModelsResponse,
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

    listAgents(): Promise<AgentListResponse>;
    getAgent(agentId: string): Promise<AgentResponse>;
    createAgent(body: AgentCreateRequest): Promise<AgentResponse>;
    updateAgent(agentId: string, body: AgentUpdateRequest): Promise<AgentResponse>;
    deleteAgent(agentId: string): Promise<AgentDeleteResponse>;

    chatStream(params: ChatStreamParams, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent>;
    confirmTool(body: ConfirmRequest): Promise<ConfirmResponse>;
    /** Inline (fill-in-the-middle) code completion for editor ghost-text. */
    complete(body: CompleteRequest): Promise<CompleteResponse>;
    /** Resume a plan parked after `plan_awaiting_execution` (multi-worker / ensemble). */
    executePlan(planId: string, body?: ExecutePlanRequest): Promise<PlanSignalResponse>;
    /** Cancel a plan parked after `plan_awaiting_execution` before any worker runs. */
    cancelPlan(planId: string): Promise<PlanSignalResponse>;

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
