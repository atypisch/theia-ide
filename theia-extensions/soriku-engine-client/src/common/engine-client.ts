/********************************************************************************
 * Soriku IDE — EngineClient service contract
 *
 * SPDX-License-Identifier: MIT
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
    WhoamiResponse,
} from './engine-types';

export const EngineClient = Symbol('EngineClient');

/**
 * Optional provider of the engine auth token. When bound (e.g. by soriku-auth, backed by the
 * OS keychain), the EngineClient prefers its token over the `soriku.engine.authToken` preference.
 */
export const EngineAuthProvider = Symbol('EngineAuthProvider');

export interface EngineAuthProvider {
    /** Current bearer token, or undefined in local/unauthenticated mode. */
    getToken(): string | undefined;
}

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

    getCapabilities(): Promise<CapabilityMapResponse>;
    getRoutingGaps(): Promise<RoutingGapsResponse>;
    listRoutingOverrides(): Promise<RoutingOverridesResponse>;
    setRoutingOverride(body: SetRoutingOverrideRequest): Promise<SetRoutingOverrideResponse>;
    deleteRoutingOverride(category: string): Promise<DeleteRoutingOverrideResponse>;
    getRecommendedRouting(): Promise<RecommendedRoutingResponse>;
    listModels(): Promise<V1ModelsResponse>;

    sendAgentFeedback(agentId: string, body: AgentFeedbackRequest): Promise<AgentFeedbackResponse>;
}
