/********************************************************************************
 * Soriku IDE — EngineClient implementation
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common';
import { EngineClient } from '../common/engine-client';
import { EngineHttpTransport } from '../common/engine-http';
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
    ChatRequest,
    ChatStreamParams,
    ConfirmRequest,
    ConfirmResponse,
    DeleteRoutingOverrideResponse,
    EngineClientConfig,
    HealthResponse,
    RecommendedRoutingResponse,
    RoutingGapsResponse,
    RoutingOverridesResponse,
    SetRoutingOverrideRequest,
    SetRoutingOverrideResponse,
    SorikuSseEvent,
    V1ModelsResponse,
} from '../common/engine-types';
import {
    DEFAULT_ENGINE_BASE_URL,
    SORIKU_ENGINE_AUTH_TOKEN,
    SORIKU_ENGINE_BASE_URL,
} from './soriku-engine-preferences';

@injectable()
export class EngineClientImpl implements EngineClient {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected createTransport(): EngineHttpTransport {
        return new EngineHttpTransport(this.getConfig());
    }

    getConfig(): EngineClientConfig {
        return {
            baseUrl: this.preferenceService.get<string>(SORIKU_ENGINE_BASE_URL, DEFAULT_ENGINE_BASE_URL),
            authToken: this.preferenceService.get<string>(SORIKU_ENGINE_AUTH_TOKEN, '') || undefined,
        };
    }

    getBaseUrl(): string {
        return this.getConfig().baseUrl;
    }

    async ping(): Promise<HealthResponse> {
        return this.createTransport().getJson<HealthResponse>('/api/health');
    }

    async getAuthMode(): Promise<AuthModeResponse> {
        return this.createTransport().getJson<AuthModeResponse>('/api/auth/mode');
    }

    async listAgents(): Promise<AgentListResponse> {
        return this.createTransport().getJson<AgentListResponse>('/api/v1/agents');
    }

    async getAgent(agentId: string): Promise<AgentResponse> {
        return this.createTransport().getJson<AgentResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}`);
    }

    async createAgent(body: AgentCreateRequest): Promise<AgentResponse> {
        return this.createTransport().postJson<AgentResponse>('/api/v1/agents', body);
    }

    async updateAgent(agentId: string, body: AgentUpdateRequest): Promise<AgentResponse> {
        return this.createTransport().patchJson<AgentResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}`, body);
    }

    async deleteAgent(agentId: string): Promise<AgentDeleteResponse> {
        return this.createTransport().deleteJson<AgentDeleteResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}`);
    }

    async *chatStream(params: ChatStreamParams, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent> {
        const body: ChatRequest = {
            prompt: params.prompt,
            persona_id: params.personaId,
            conversation_id: params.conversationId ?? null,
            project_id: params.projectId ?? null,
            mode: params.mode ?? null,
            stream: true,
        };
        const path = params.useWorker === false ? '/api/chat' : '/api/worker';
        const transport = this.createTransport();
        for await (const event of transport.postSse(path, body, signal)) {
            yield event;
        }
    }

    async confirmTool(body: ConfirmRequest): Promise<ConfirmResponse> {
        return this.createTransport().postJson<ConfirmResponse>('/api/worker/confirm', body);
    }

    async getCapabilities(): Promise<CapabilityMapResponse> {
        return this.createTransport().getJson<CapabilityMapResponse>('/api/capabilities');
    }

    async getRoutingGaps(): Promise<RoutingGapsResponse> {
        return this.createTransport().getJson<RoutingGapsResponse>('/api/gaps');
    }

    async listRoutingOverrides(): Promise<RoutingOverridesResponse> {
        return this.createTransport().getJson<RoutingOverridesResponse>('/api/routing/overrides');
    }

    async setRoutingOverride(body: SetRoutingOverrideRequest): Promise<SetRoutingOverrideResponse> {
        return this.createTransport().postJson<SetRoutingOverrideResponse>('/api/routing/overrides', body);
    }

    async deleteRoutingOverride(category: string): Promise<DeleteRoutingOverrideResponse> {
        return this.createTransport().deleteJson<DeleteRoutingOverrideResponse>(
            `/api/routing/overrides/${encodeURIComponent(category)}`
        );
    }

    async getRecommendedRouting(): Promise<RecommendedRoutingResponse> {
        return this.createTransport().getJson<RecommendedRoutingResponse>('/api/routing/recommended');
    }

    async listModels(): Promise<V1ModelsResponse> {
        return this.createTransport().getJson<V1ModelsResponse>('/api/v1/models');
    }

    async sendAgentFeedback(agentId: string, body: AgentFeedbackRequest): Promise<AgentFeedbackResponse> {
        return this.createTransport().postJson<AgentFeedbackResponse>(
            `/api/v1/agents/${encodeURIComponent(agentId)}/feedback`,
            body
        );
    }
}
