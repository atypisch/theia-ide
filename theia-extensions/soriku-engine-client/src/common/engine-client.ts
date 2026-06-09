/********************************************************************************
 * Soriku IDE — EngineClient service contract
 ********************************************************************************/

import {
    AgentCreateRequest,
    AgentDeleteResponse,
    AgentFeedbackRequest,
    AgentFeedbackResponse,
    AgentListResponse,
    AgentResponse,
    AgentUpdateRequest,
    AuthModeResponse,
    CapabilityMapResponse,
    ChatStreamParams,
    ConfirmRequest,
    ConfirmResponse,
    DeleteRoutingOverrideResponse,
    HealthResponse,
    RecommendedRoutingResponse,
    RoutingGapsResponse,
    RoutingOverridesResponse,
    SetRoutingOverrideRequest,
    SetRoutingOverrideResponse,
    SorikuSseEvent,
    V1ModelsResponse,
} from './engine-types';

export const EngineClient = Symbol('EngineClient');

export interface EngineClient {
    /** Current resolved base URL (from preferences). */
    getBaseUrl(): string;

    ping(): Promise<HealthResponse>;
    getAuthMode(): Promise<AuthModeResponse>;

    listAgents(): Promise<AgentListResponse>;
    getAgent(agentId: string): Promise<AgentResponse>;
    createAgent(body: AgentCreateRequest): Promise<AgentResponse>;
    updateAgent(agentId: string, body: AgentUpdateRequest): Promise<AgentResponse>;
    deleteAgent(agentId: string): Promise<AgentDeleteResponse>;

    chatStream(params: ChatStreamParams, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent>;
    confirmTool(body: ConfirmRequest): Promise<ConfirmResponse>;

    getCapabilities(): Promise<CapabilityMapResponse>;
    getRoutingGaps(): Promise<RoutingGapsResponse>;
    listRoutingOverrides(): Promise<RoutingOverridesResponse>;
    setRoutingOverride(body: SetRoutingOverrideRequest): Promise<SetRoutingOverrideResponse>;
    deleteRoutingOverride(category: string): Promise<DeleteRoutingOverrideResponse>;
    getRecommendedRouting(): Promise<RecommendedRoutingResponse>;
    listModels(): Promise<V1ModelsResponse>;

    sendAgentFeedback(agentId: string, body: AgentFeedbackRequest): Promise<AgentFeedbackResponse>;
}
