/********************************************************************************
 * Soriku IDE — EngineClient implementation
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common';
import { EngineClient } from '../common/engine-client';
import { EngineHttpTransport } from '../common/engine-http';
import { EngineAuthTokenHolder } from './engine-auth-token-holder';
import {
    AddProviderRequest,
    AddProviderResponse,
    AgentCreateRequest,
    AgentDeleteResponse,
    AgentFeedbackRequest,
    AgentFeedbackResponse,
    AgentListResponse,
    AgentPersona,
    AgentResponse,
    AgentUpdateRequest,
    AuthModeResponse,
    BrowseModelsResponse,
    CompleteRequest,
    CompleteResponse,
    CapabilityMapResponse,
    ChatRequest,
    ChatStreamParams,
    ConfirmRequest,
    ConfirmResponse,
    ConversationDetail,
    ConversationSummary,
    DeleteRoutingOverrideResponse,
    DiscoverModelsResponse,
    ExecutePlanRequest,
    EngineClientConfig,
    HealthResponse,
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
} from '../common/engine-types';
import {
    DEFAULT_ENGINE_BASE_URL,
    DEFAULT_ENGINE_TIMEOUT_MS,
    SORIKU_ENGINE_AUTH_TOKEN,
    SORIKU_ENGINE_BASE_URL,
    SORIKU_ENGINE_TIMEOUT,
} from './soriku-engine-preferences';

@injectable()
export class EngineClientImpl implements EngineClient {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(EngineAuthTokenHolder)
    protected readonly tokenHolder: EngineAuthTokenHolder;

    protected createTransport(): EngineHttpTransport {
        return new EngineHttpTransport(this.getConfig());
    }

    getConfig(): EngineClientConfig {
        const preferenceToken = this.preferenceService.get<string>(SORIKU_ENGINE_AUTH_TOKEN, '') || undefined;
        return {
            baseUrl: this.preferenceService.get<string>(SORIKU_ENGINE_BASE_URL, DEFAULT_ENGINE_BASE_URL),
            authToken: this.tokenHolder.getToken() ?? preferenceToken,
            timeoutMs: this.preferenceService.get<number>(SORIKU_ENGINE_TIMEOUT, DEFAULT_ENGINE_TIMEOUT_MS),
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

    async whoami(): Promise<WhoamiResponse> {
        return this.createTransport().getJson<WhoamiResponse>('/api/v1/auth/whoami');
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
            conversation_id: params.conversationId,
            project_id: params.projectId,
            mode: params.mode,
            model_id: params.modelId,
            worker_count: params.workerCount,
            worker_models: params.workerModels && params.workerModels.length > 0 ? params.workerModels : undefined,
            tools_enabled: params.toolsEnabled,
            stream: true,
            client_tools: params.clientTools && params.clientTools.length > 0 ? params.clientTools : undefined,
            pilot_tools: params.mode === 'plan' || params.mode === 'single' || params.mode === 'auto' ? true : undefined,
            context: params.context && params.context.length > 0 ? params.context : undefined,
            plan_auto_execute: params.mode === 'plan' ? false : params.planAutoExecute,
            routing_strategy: params.routingStrategy,
            cloud_cost_cap_eur: params.cloudCostCapEur,
        };
        const transport = this.createTransport();
        for await (const event of transport.postSse('/api/worker', body, signal)) {
            yield event;
        }
    }

    async confirmTool(body: ConfirmRequest): Promise<ConfirmResponse> {
        return this.createTransport().postJson<ConfirmResponse>('/api/worker/confirm', body);
    }

    async complete(body: CompleteRequest): Promise<CompleteResponse> {
        return this.createTransport().postJson<CompleteResponse>('/api/complete', body);
    }

    async executePlan(planId: string, body?: ExecutePlanRequest): Promise<PlanSignalResponse> {
        return this.createTransport().postJson<PlanSignalResponse>(
            `/api/plan/${encodeURIComponent(planId)}/execute`,
            body ?? {},
        );
    }

    async cancelPlan(planId: string): Promise<PlanSignalResponse> {
        return this.createTransport().postJson<PlanSignalResponse>(`/api/plan/${encodeURIComponent(planId)}/cancel`, {});
    }

    async getSubagentInsight(planId: string, minionId: string, parentAgentId?: string): Promise<SubagentInsight> {
        const query = parentAgentId ? `?parent_agent_id=${encodeURIComponent(parentAgentId)}` : '';
        return this.createTransport().getJson<SubagentInsight>(
            `/api/plan/${encodeURIComponent(planId)}/minions/${encodeURIComponent(minionId)}/insight${query}`,
        );
    }

    async getSubagentPotential(planId: string, minionId: string, parentAgentId?: string): Promise<SubagentPotential> {
        const query = parentAgentId ? `?parent_agent_id=${encodeURIComponent(parentAgentId)}` : '';
        return this.createTransport().getJson<SubagentPotential>(
            `/api/plan/${encodeURIComponent(planId)}/minions/${encodeURIComponent(minionId)}/potential${query}`,
        );
    }

    async promoteSubagent(subagentId: string, planId: string): Promise<AgentPersona> {
        return this.createTransport().postJson<AgentPersona>('/api/agent/promote', { subagentId, planId });
    }

    async spawnSubagent(planId: string, body: SpawnMinionRequest): Promise<MinionSpawnOutcome> {
        return this.createTransport().postJson<MinionSpawnOutcome>(
            `/api/plan/${encodeURIComponent(planId)}/spawn`,
            { role: body.role, goal: body.goal, parentAgentId: body.parentAgentId },
        );
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

    async listMcpServers(): Promise<McpServersResponse> {
        return this.createTransport().getJson<McpServersResponse>('/api/mcp/servers');
    }

    async putMcpServers(servers: McpServer[], enabled?: boolean): Promise<McpPutResponse> {
        const body: { servers: McpServer[]; enabled?: boolean } = { servers };
        if (enabled !== undefined) {
            body.enabled = enabled;
        }
        return this.createTransport().requestJson<McpPutResponse>('PUT', '/api/mcp/servers', body);
    }

    async testMcpServer(server: McpServer): Promise<McpTestResponse> {
        return this.createTransport().postJson<McpTestResponse>('/api/mcp/test', server);
    }

    async getRecommendedRouting(): Promise<RecommendedRoutingResponse> {
        return this.createTransport().getJson<RecommendedRoutingResponse>('/api/routing/recommended');
    }

    async listModels(): Promise<V1ModelsResponse> {
        return this.createTransport().getJson<V1ModelsResponse>('/api/v1/models');
    }

    async listProviders(): Promise<ProvidersResponse> {
        return this.createTransport().getJson<ProvidersResponse>('/api/providers');
    }

    async listInstalledModels(): Promise<InstalledModelsResponse> {
        return this.createTransport().getJson<InstalledModelsResponse>('/api/models/installed');
    }

    async *pullModel(name: string, signal?: AbortSignal): AsyncGenerator<SorikuSseEvent> {
        for await (const event of this.createTransport().postSse('/api/models/pull', { name }, signal)) {
            yield event;
        }
    }

    async deleteModel(modelId: string): Promise<ModelMutationResponse> {
        return this.createTransport().deleteJson<ModelMutationResponse>(`/api/models/${encodeURIComponent(modelId)}`);
    }

    async activateModel(modelId: string): Promise<ModelMutationResponse> {
        return this.createTransport().postJson<ModelMutationResponse>(`/api/models/${encodeURIComponent(modelId)}/activate`, {});
    }

    async deactivateModel(modelId: string): Promise<ModelMutationResponse> {
        return this.createTransport().postJson<ModelMutationResponse>(`/api/models/${encodeURIComponent(modelId)}/deactivate`, {});
    }

    async warmModel(modelId: string): Promise<ModelMutationResponse> {
        return this.createTransport().postJson<ModelMutationResponse>(`/api/models/${encodeURIComponent(modelId)}/load`, {});
    }

    async browseModels(query: string): Promise<BrowseModelsResponse> {
        return this.createTransport().getJson<BrowseModelsResponse>(`/api/models/browse?q=${encodeURIComponent(query)}&limit=40`);
    }

    async listConversations(): Promise<ConversationSummary[]> {
        return this.createTransport().getJson<ConversationSummary[]>('/api/conversations');
    }

    async getConversation(id: string): Promise<ConversationDetail> {
        return this.createTransport().getJson<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
    }

    async deleteConversation(id: string): Promise<ModelMutationResponse> {
        return this.createTransport().deleteJson<ModelMutationResponse>(`/api/conversations/${encodeURIComponent(id)}`);
    }

    async renameConversation(id: string, title: string): Promise<RenameConversationResponse> {
        return this.createTransport().postJson<RenameConversationResponse>(`/api/conversations/${encodeURIComponent(id)}/rename`, { title });
    }

    async listProviderPresets(): Promise<ProviderPresetsResponse> {
        return this.createTransport().getJson<ProviderPresetsResponse>('/api/providers/presets');
    }

    async listUserProviders(): Promise<UserProvidersResponse> {
        return this.createTransport().getJson<UserProvidersResponse>('/api/providers/user');
    }

    async addProvider(body: AddProviderRequest): Promise<AddProviderResponse> {
        return this.createTransport().postJson<AddProviderResponse>('/api/providers/add', body);
    }

    async deleteUserProvider(providerId: string): Promise<ModelMutationResponse> {
        return this.createTransport().deleteJson<ModelMutationResponse>(`/api/providers/user/${encodeURIComponent(providerId)}`);
    }

    async discoverProviderModels(baseUrl: string, apiKey?: string): Promise<DiscoverModelsResponse> {
        return this.createTransport().postJson<DiscoverModelsResponse>('/api/providers/discover-models', { base_url: baseUrl, api_key: apiKey ?? '' });
    }

    async sendAgentFeedback(agentId: string, body: AgentFeedbackRequest): Promise<AgentFeedbackResponse> {
        return this.createTransport().postJson<AgentFeedbackResponse>(
            `/api/v1/agents/${encodeURIComponent(agentId)}/feedback`,
            body
        );
    }
}
