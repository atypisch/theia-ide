/********************************************************************************
 * Soriku IDE — Engine API types (Phase 2.1)
 * Derived from docs/PHASE_2_ENGINE_CONTRACT.md — do not invent fields.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface AgentPersona {
    id: string;
    name: string;
    role: string;
    category: string;
    version: number;
    preferred_model?: string | null;
    persona: AgentPersonaConfig;
    specializations: AgentSpecialization[];
    memory: Record<string, unknown>;
    intelligence: AgentIntelligence;
    knowledge: AgentKnowledge;
    learning: Record<string, unknown>;
    benchmarks: Record<string, unknown>;
    shortcuts: Record<string, unknown>[];
    simezu: AgentSimezuConfig;
    stats: Record<string, unknown>;
}

export interface AgentPersonaConfig {
    description?: string;
    avatar_icon?: string;
    avatar_color?: string;
    tone?: string;
    language?: string;
}

export interface AgentSpecialization {
    name: string;
    level?: string;
}

export interface AgentIntelligence {
    system_prompt: string;
    domain_rules?: string[];
    examples?: Record<string, unknown>[];
    anti_patterns?: string[];
}

export interface AgentKnowledge {
    documents?: Record<string, unknown>[];
    max_context_tokens?: number;
}

export interface AgentSimezuConfig {
    persona_id?: string;
    visibility?: string;
    published?: boolean;
}

export interface AgentListResponse {
    data: AgentPersona[];
    total: number;
}

export interface AgentResponse {
    data: AgentPersona;
}

export interface AgentDeleteResponse {
    deleted: boolean;
    id: string;
}

export interface AgentCreateRequest {
    name: string;
    role?: string;
    description?: string;
    system_prompt?: string;
    preferred_model?: string;
    visibility?: string;
}

export interface AgentUpdateRequest {
    name?: string;
    role?: string;
    description?: string;
    system_prompt?: string;
    preferred_model?: string | null;
    visibility?: string;
}

export interface ChatContextItem {
    type: 'file' | 'text' | 'embedding_query';
    value: string;
}

export type ChatMode = 'auto' | 'single' | 'plan' | 'verify' | 'ensemble';

export interface ChatRequest {
    prompt: string;
    images?: string[] | null;
    model_hint?: string | null;
    model_id?: string | null;
    conversation_id?: string | null;
    project_id?: string | null;
    persona_id?: string | null;
    agent_id?: string | null;
    context?: ChatContextItem[] | null;
    stream?: boolean;
    mode?: ChatMode | null;
    worker_count?: string | null;
    pilot_tools?: boolean | null;
    disabled_tools?: string[] | null;
    tools_enabled?: boolean | null;
    /** Tools the IDE will execute itself (against its workspace) instead of the engine. */
    client_tools?: string[] | null;
    /** Explicit models to collaborate on one ensemble answer (one worker each). */
    worker_models?: string[] | null;
}

export interface ConfirmRequest {
    confirmation_id: string;
    approved: boolean;
    remember?: '' | 'session';
    /** For client-executed tools: the tool output, shaped {result|error: string}. */
    result?: ToolExecResult | null;
}

/** Result of executing a tool, matching the engine's ToolRegistry.execute() shape. */
export interface ToolExecResult {
    result?: string;
    error?: string;
}

export interface ConfirmResponse {
    ok: boolean;
}

export interface PlanSignalResponse {
    status: string;
    plan_id: string;
}

export interface ProviderInfo {
    name: string;
    display_name: string;
    is_local: boolean;
    healthy: boolean;
    models_available: number;
    error?: string | null;
}

export interface ProvidersResponse {
    providers: ProviderInfo[];
}

export interface InstalledModel {
    id: string;
    name?: string;
    tag?: string;
    size_gb?: number;
    role?: string;
    is_running?: boolean;
    is_embedding?: boolean;
    inactive?: boolean;
    [key: string]: unknown;
}

export interface InstalledModelsResponse {
    models: InstalledModel[];
}

export interface ProviderPreset {
    id: string;
    display_name: string;
    icon?: string;
    base_url?: string;
    api_key_url?: string;
    provider_class?: string;
    tags?: string[];
    description?: string;
}

export interface ProviderPresetsResponse {
    presets: ProviderPreset[];
}

export interface AddProviderRequest {
    preset_id?: string;
    display_name?: string;
    base_url?: string;
    api_key?: string;
    models?: string[];
    is_local?: boolean;
    tags?: string[];
}

export interface AddProviderResponse {
    id: string;
    status: string;
}

export interface UserProvider {
    id: string;
    preset_id?: string | null;
    display_name: string;
    base_url?: string;
    enabled?: boolean;
    models?: string[];
    is_local?: boolean;
    tags?: string[];
}

export interface UserProvidersResponse {
    providers: UserProvider[];
}

export interface BrowseModel {
    model_id: string;
    name?: string;
    source?: string;
    provider?: string;
    description?: string;
    parameters?: string;
    size_gb?: number;
    cost_type?: string;
    cost_label?: string;
    tags?: string[];
    is_installed?: boolean;
    [key: string]: unknown;
}

export interface BrowseModelsResponse {
    models: BrowseModel[];
    [key: string]: unknown;
}

export interface DiscoveredModel {
    id: string;
    display_name?: string;
    context_window?: number;
}

export interface DiscoverModelsResponse {
    models: DiscoveredModel[];
}

/** Generic ok/status response for model mutations (delete/activate/…). */
export interface ModelMutationResponse {
    ok?: boolean;
    status?: string;
    model_id?: string;
    error?: string;
    [key: string]: unknown;
}

export interface AuthModeResponse {
    auth_mode: string;
    simezu_base_url?: string | null;
}

/**
 * Response of `GET /api/v1/auth/whoami`. The engine contract does not fix the exact shape,
 * so fields are optional; the index signature preserves whatever the engine returns.
 */
export interface WhoamiResponse {
    user_id?: string;
    email?: string;
    name?: string;
    display_name?: string;
    tenant_id?: string;
    [key: string]: unknown;
}

export interface HealthResponse {
    status?: string;
    [key: string]: unknown;
}

export interface RankedModelInfo {
    model_id: string;
    score: number;
    rank: number;
    confidence: number;
    provider: string;
    is_local: boolean;
    cost_per_1k: number;
}

export interface RoutingDecision {
    model: string;
    category: string;
    confidence: number;
    reasoning: string;
    alternatives: string[];
    mode: 'single' | 'verify' | 'ensemble';
    provider: string;
    forced: boolean;
    override_source?: 'category' | 'request' | null;
    ranked_models: RankedModelInfo[];
}

export interface CapabilityMapResponse {
    status?: string;
    message?: string;
    models?: Record<string, unknown>;
    routing_table?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RoutingGapsResponse {
    gaps: unknown[];
}

export interface RoutingOverride {
    category: string;
    model_id: string;
    [key: string]: unknown;
}

export interface RoutingOverridesResponse {
    overrides: RoutingOverride[];
}

export interface SetRoutingOverrideRequest {
    category: string;
    model_id: string;
}

export interface SetRoutingOverrideResponse {
    ok: boolean;
    category: string;
    model_id: string;
}

export interface DeleteRoutingOverrideResponse {
    ok: boolean;
    removed: boolean;
}

export interface RecommendedRoutingResponse {
    recommended: unknown;
    current: unknown;
    has_remote: boolean;
    has_local: boolean;
}

export interface AgentFeedbackRequest {
    rating: string;
    input?: string;
    output?: string;
    reason?: string;
    annotation?: string;
    category?: string;
    context?: string;
}

export interface AgentFeedbackResponse {
    data: Record<string, unknown>;
}

export interface V1ModelDescriptor {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    [key: string]: unknown;
}

export interface V1ModelsResponse {
    object?: string;
    data: V1ModelDescriptor[];
    plan?: string;
}

/** Parsed SSE event from Soriku engine streams. */
export interface SorikuSseEvent {
    type: string;
    [key: string]: unknown;
}

export interface ChatStreamParams {
    prompt: string;
    personaId: string;
    conversationId?: string;
    projectId?: string;
    mode?: ChatMode;
    useWorker?: boolean;
    /** Tools the IDE will execute locally; forwarded to the engine as `client_tools`. */
    clientTools?: string[];
    /** Force a specific model (only meaningful in `single` mode). */
    modelId?: string;
    /** Number of workers for ensemble mode ('auto' or 2..5). */
    workerCount?: string;
    /** Explicit models to combine in ensemble mode (overrides workerCount). */
    workerModels?: string[];
    /** Set false for chat-only (no tools / no file edits). */
    toolsEnabled?: boolean;
}

export interface EngineClientConfig {
    baseUrl: string;
    authToken?: string;
    /** Timeout in milliseconds applied to non-streaming requests. SSE streams are never timed out. */
    timeoutMs?: number;
}
