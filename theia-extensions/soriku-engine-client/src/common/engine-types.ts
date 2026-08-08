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
    /** Default per-request routing strategy, seeded into a new chat when unset there. */
    preferred_routing_strategy?: string | null;
    /** Tools this agent may use — narrows (never expands) its role/task allowlist. null/absent = unrestricted. */
    tool_whitelist?: string[] | null;
    /** "" = user-created; "minion" = spawned by a head agent during a plan run. */
    origin?: string;
    /** A repeatedly-good minion the engine promoted to a persistent sub-agent. */
    promoted?: boolean;
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
    /** Editable keyword→weight decision patterns (memory.decision_patterns). */
    decision_patterns?: Record<string, number>;
    preferred_routing_strategy?: string;
    tool_whitelist?: string[];
}

export interface ChatContextItem {
    type: 'file' | 'text' | 'embedding_query';
    value: string;
}

/**
 * What kind of run the engine should do. `verify` and `ensemble` used to be
 * separate modes here; the engine has translated both into plan mode for
 * months, and the IDE now asks for that shape directly (mode 'plan' plus
 * `worker_models`), so they are gone from the request side. They can still
 * appear in a RoutingDecision the engine sends back.
 */
export type ChatMode = 'auto' | 'single' | 'plan';

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
    /**
     * Explicit models to run the SAME prompt on, one worker each, answers
     * merged. With `mode: 'plan'` this makes the engine skip the planning
     * step entirely (a replication plan) — there is nothing to decompose.
     */
    worker_models?: string[] | null;
    /** Override settings.plan.auto_execute for this request (IDE Plan mode sends false). */
    plan_auto_execute?: boolean | null;
    /**
     * Per-request routing strategy — overrides the engine's saved one for THIS
     * request only (never persisted), so the IDE can run local-first without
     * touching the soriku web app's global setting.
     */
    routing_strategy?: RoutingStrategy | null;
    /**
     * Per-request cloud spend cap in EUR for this plan (not persisted). Local
     * models are free, so this caps cloud usage: 0 blocks any paid plan.
     */
    cloud_cost_cap_eur?: number | null;
    /** Plan-authoring model choice (mode="plan" only) — one model writes the plan. */
    plan_model_id?: string | null;
    /** Plan-authoring model choice (mode="plan" only) — 2+ models draft, a judge picks the best. */
    plan_models?: string[] | null;
    /**
     * Opt-in (mode="plan" only): let plan workers use connected MCP tools.
     * Off by default — MCP servers can reach outside this machine, so
     * autonomous plan workers don't get them unless the user explicitly
     * enables `soriku.tools.planMcp`.
     */
    allow_mcp?: boolean | null;
}

/**
 * Routing strategy buckets the engine understands (core/routing_policy.py).
 * - prefer_local: local models only (drop paid/external)
 * - local_with_remote_conductor: local workers, a remote model may plan ("hybrid")
 * - balanced: cost-aware mix
 * - prefer_quality: best model regardless of locality/cost (cloud allowed)
 */
export type RoutingStrategy = 'prefer_local' | 'local_with_remote_conductor' | 'balanced' | 'prefer_quality';

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

/** Inline (fill-in-the-middle) code-completion request for editor ghost-text. */
export interface CompleteRequest {
    prefix: string;
    suffix?: string;
    language?: string;
    path?: string;
    max_tokens?: number;
}

export interface CompleteResponse {
    completion: string;
}

/** ⌘K inline-edit request: an instruction + the full file text, engine proposes hunks. */
export interface InlineEditRequest {
    path: string;
    language?: string;
    instruction: string;
    file_content: string;
    selection: string;
    model_id?: string;
}

export interface InlineEditHunk {
    /** 1-based, inclusive. */
    start_line: number;
    /** 1-based, inclusive. */
    end_line: number;
    /** Sliced by the engine from the real file_content — never model-hallucinated. */
    old_text: string;
    new_text: string;
    description: string;
}

export interface InlineEditResponse {
    title: string;
    hunks: InlineEditHunk[];
}

export interface PlanTaskEdit {
    id: string;
    goal: string;
}

export interface ExecutePlanRequest {
    task_edits?: PlanTaskEdit[];
}

export interface PlanSignalResponse {
    status: string;
    plan_id: string;
}

// ── Subagents (minions) — Fase F5: Insight / Potential / Spawn ─────────────
// Only available for a minion's originating plan run while it's still active
// (the engine's success streak is in-memory, per-run); insight's role-level
// run/success counts persist across runs, its feedback data is durable.

export interface SubagentInsight {
    role: string;
    /** Durable, cross-run count for this role — resets never. */
    runs: number;
    /** successes / runs for this role, or null when runs is 0. */
    success_rate: number | null;
    /** Human-readable notes derived from this subagent's own feedback_history entries. */
    learned: string[];
    /** Decision-pattern keyword -> current weight, limited to keys this subagent touched. */
    patterns: Record<string, number>;
    feedback_positive: number;
    feedback_negative: number;
}

export interface SubagentPotentialThreshold {
    key: string;
    label: string;
    value: number;
    target: number;
    met: boolean;
    /** True only for the engine's own real promotion rule (the streak); the other criteria are derived UI signals and never gate the promote action. */
    authoritative: boolean;
}

export interface SubagentPotential {
    role: string;
    thresholds: SubagentPotentialThreshold[];
    flagged: boolean;
    /** Mirrors the engine's own criterion — /api/agent/promote re-checks this itself. */
    eligible_to_promote: boolean;
    score: number;
}

export interface SpawnMinionRequest {
    role: string;
    goal: string;
    parentAgentId: string;
}

export interface MinionSpawnOutcome {
    minion_id: string | null;
    name?: string;
    role?: string;
    parent_agent_id?: string | null;
    status: string;
    success?: boolean;
    promoted?: boolean;
    result?: string;
    error?: string;
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

export interface ConversationSummary {
    id: string;
    title: string;
    created_at: string;
    message_count: number;
    project_id?: string | null;
    persona_id?: string | null;
    visibility?: string;
}

export interface ConversationMessage {
    role: string;
    content: string;
    model?: string | null;
    mode?: string | null;
    timestamp?: string;
    [key: string]: unknown;
}

export interface ConversationDetail {
    id: string;
    title: string;
    created_at?: string;
    messages: ConversationMessage[];
    persona_id?: string | null;
    project_id?: string | null;
    [key: string]: unknown;
}

export interface RenameConversationResponse {
    ok: boolean;
    title: string;
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
    /** Simezu groups (teams) this account belongs to — real data from AuthContext, empty outside Simezu/local mode. */
    available_groups?: SimezuGroup[];
    [key: string]: unknown;
}

export interface SimezuGroup {
    id: string;
    name: string;
    type?: string;
    member_count?: number;
    role?: string;
    [key: string]: unknown;
}

export interface HealthResponse {
    status?: string;
    [key: string]: unknown;
}

/** Response from POST /api/v1/transcribe (core/voice — real, non-mocked speech-to-text). */
export interface TranscribeResponse {
    text: string;
    language_detected?: string;
    duration_seconds?: number;
    provider_used?: string;
    model_used?: string;
    processing_time_ms?: number;
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
    /**
     * The engine's own routing verdict. Still reports 'verify'/'ensemble' for
     * prompts its auto-router judged worth several answers — it translates
     * those into a plan itself. Read-only here; not a ChatMode we can send.
     */
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
    /** Editor / workspace context forwarded to the engine. */
    context?: ChatContextItem[];
    mode?: ChatMode;
    useWorker?: boolean;
    /** Tools the IDE will execute locally; forwarded to the engine as `client_tools`. */
    clientTools?: string[];
    /** Force a specific model (only meaningful in `single` mode). */
    modelId?: string;
    /** Number of workers when the engine picks the models ('auto' or 2..5). */
    workerCount?: string;
    /** Explicit models to compare — one worker each (overrides workerCount). */
    workerModels?: string[];
    /** Set false for chat-only (no tools / no file edits). */
    toolsEnabled?: boolean;
    /** When false, park the plan until the user approves (Plan behaviour). */
    planAutoExecute?: boolean;
    /**
     * Per-request routing strategy (local-first / balanced / quality). Sent to
     * the engine as `routing_strategy`; not persisted, so it never changes the
     * soriku web app's global setting.
     */
    routingStrategy?: RoutingStrategy;
    /**
     * Per-request cloud spend cap in EUR (sent as `cloud_cost_cap_eur`, not
     * persisted). Local is free, so this caps cloud usage; 0 blocks any paid
     * plan. Omitted → engine's saved/default cap.
     */
    cloudCostCapEur?: number;
    /** Base64-encoded images (no `data:` prefix) attached to this message. */
    images?: string[];
    /** Plan mode only: one model to author the plan. */
    planModelId?: string;
    /** Plan mode only: 2+ models draft competing plans; a judge picks the best. */
    planModels?: string[];
    /** Plan mode only: let plan workers use connected MCP tools (soriku.tools.planMcp). */
    allowMcp?: boolean;
}

export interface EngineClientConfig {
    baseUrl: string;
    authToken?: string;
    /** Timeout in milliseconds applied to non-streaming requests. SSE streams have no overall timeout. */
    timeoutMs?: number;
    /**
     * Idle watchdog for SSE streams (#4): abort when NO bytes arrive for this long
     * (a hung engine would otherwise block the reader forever). Default 300 000 ms.
     */
    sseIdleTimeoutMs?: number;
    /**
     * Active Simezu group/tenant (teams) — sent as X-Soriku-Group; the engine's
     * auth middleware uses it to pick request context. Omitted when not signed
     * in or on the default group.
     */
    groupId?: string;
}

// ── External MCP servers (client) ──
export interface McpServer {
    name: string;
    transport?: string;            // 'stdio' | 'sse'
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    enabled?: boolean;
    allowlist?: string[];
    requires_confirmation?: boolean;
}

export interface McpServersResponse {
    enabled?: boolean;
    servers: McpServer[];
    health?: Record<string, string>;   // server name → 'ok' | error
}

export interface McpPutResponse {
    saved: number;
    health: Record<string, string>;
}

export interface McpTestResponse {
    ok: boolean;
    tools: string[];
    error?: string | null;
}

// ── Billing / plans (Fase 6) — mirrors core/billing/plans.py exactly ───────

export interface PlanPricing {
    price: number;
    founder_price: number | null;
    founder_active: boolean;
    billing_unit: string;
}

export interface PlanCapabilities {
    byok: boolean;
    api_access: boolean;
    priority_routing: boolean;
    shared_agents: boolean;
    shared_providers: boolean;
    worker_tools: boolean;
    hosted_execution: boolean;
    daily_cost_limit: number | null;
}

export interface BillingPlan {
    name: string;
    price_eur: number;
    founder_price_eur: number | null;
    billing_unit: string;
    max_seats: number;
    max_api_keys: number;
    capabilities: PlanCapabilities;
    features: string[];
    pricing: PlanPricing;
}

export interface BillingPlansResponse {
    plans: Record<string, BillingPlan>;
    current_plan: string;
    payment_status: string;
}

export interface CreateCheckoutRequest {
    plan: string;
    seats?: number;
}

/**
 * Success shape only — a 400 (Simezu not configured / no group for this
 * tenant) throws an `EndpointError` instead of resolving; the engine's
 * `{error, message}` body is on `error.body`, not a resolved value.
 */
export interface CreateCheckoutResponse {
    checkout_url: string;
}

/** Success shape only — see CreateCheckoutResponse's note on the error path. */
export interface BillingPortalResponse {
    portal_url: string;
}
