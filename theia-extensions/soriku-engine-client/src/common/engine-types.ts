/********************************************************************************
 * Soriku IDE — Engine API types (Phase 2.1)
 * Derived from docs/PHASE_2_ENGINE_CONTRACT.md — do not invent fields.
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
}

export interface ConfirmRequest {
    confirmation_id: string;
    approved: boolean;
    remember?: '' | 'session';
}

export interface ConfirmResponse {
    ok: boolean;
}

export interface AuthModeResponse {
    auth_mode: string;
    simezu_base_url?: string | null;
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
}

export interface EngineClientConfig {
    baseUrl: string;
    authToken?: string;
    /** Timeout in milliseconds applied to non-streaming requests. SSE streams are never timed out. */
    timeoutMs?: number;
}
