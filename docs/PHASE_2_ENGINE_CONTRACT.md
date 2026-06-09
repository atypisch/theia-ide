# Phase 2.0 — Soriku Engine Contract

**Canonical reference for Soriku IDE ↔ engine integration.**  
**Read-only inventory completed:** 2026-06-08  
**Soriku codebase:** `/Users/martentiman/Sites/soriku`  
**Engine process:** FastAPI `server.py`, default `http://127.0.0.1:8765`

> **Default URL note:** The bootstrap prompt specifies IDE preference default `http://localhost:8000`. The actual Soriku engine binds to **port 8765** (`server.py:6635`). The IDE `soriku.engine.baseUrl` default should be **`http://127.0.0.1:8765`** until/unless the engine port changes. Hosted URL (`https://api.soriku.ai` or similar) is runtime configuration only — no separate build.

---

## 1. Architecture summary

| Layer | Role |
|-------|------|
| **Soriku IDE** (Theia monorepo) | UI shell: agents panel, chat, tool bridge, auth, customization |
| **Soriku engine** (`server.py`) | Headless backend: routing, personas, SSE chat, tool registry, capability map |
| **Transport** | Native `fetch` + `EventSource` (SSE). No Axios. |

### Auth modes (`core/auth/middleware.py`)

| Mode | Behaviour | IDE impact |
|------|-----------|------------|
| **Local** (default) | Middleware injects `LOCAL_AUTH_CONTEXT` — always authenticated, `tenant_id="local"` | No Bearer token required; local-only mode fully functional |
| **Simezu (hosted)** | Bearer required; `sk-soriku-*` API keys; optional `X-Soriku-Group` | Token via `soriku.engine.authToken` preference (Phase 2.5) |

**Public endpoints (no Bearer in Simezu mode):** `/`, `/api/health`, `/api/auth/mode`, `/api/auth/session-detect`, `/api/mcp/config`, `/api/webhooks/stripe`, `/api/events`, `/static/*`, `/api/shared/*`, `/api/auth/simezu/proxy/*`

### Dual API surfaces (important)

Soriku exposes **legacy** (`/api/*`) and **v1** (`/api/v1/*`) APIs in parallel.

| Concern | Recommended for IDE | Legacy alternative |
|---------|---------------------|-------------------|
| Agent CRUD | **`/api/v1/agents`** (`{data, total}` envelope) | `/api/agents` (bare arrays/objects) |
| Agent chat (streaming) | **`/api/worker`** (tools + SSE) or **`/api/chat`** (no tools) | `/api/pilot` (deprecated alias) |
| Capability map | **`/api/capabilities`** | — |
| Tool confirmation | **`/api/worker/confirm`** | `/api/pilot/confirm` (deprecated) |
| Feedback | **`/api/v1/agents/{id}/feedback`** | `/api/feedback` (conversation-indexed) |
| Health / connectivity | **`/api/health`** + **`/api/auth/mode`** | — |

**IDE rule:** Prefer v1 where available. Do not invent endpoints.

---

## 2. IDE integration surface (`EngineClient` methods)

These map 1-to-1 to Phase 2.1 `EngineClient` service methods.

### 2.1 Connectivity

| Method | HTTP | Path | Auth | Response |
|--------|------|------|------|----------|
| `ping()` | GET | `/api/health` | middleware | Health object from `SorikuRouter.check_health()` |
| `getAuthMode()` | GET | `/api/auth/mode` | public | `{auth_mode, simezu_base_url?}` |

### 2.2 Agents

| Method | HTTP | Path | Auth | Request | Response |
|--------|------|------|------|---------|----------|
| `listAgents()` | GET | `/api/v1/agents` | `require_auth` | — | `{data: AgentPersona[], total}` |
| `getAgent(id)` | GET | `/api/v1/agents/{id}` | auth | — | `{data: agent}` or 404 |
| `updateAgent(id, patch)` | PATCH | `/api/v1/agents/{id}` | auth | partial fields (see §3.1) | `{data: agent}` |
| `createAgent(body)` | POST | `/api/v1/agents` | auth | `{name, role?, description?, system_prompt?, preferred_model?, visibility?}` | `{data: agent}` |
| `deleteAgent(id)` | DELETE | `/api/v1/agents/{id}` | auth | — | `{deleted, id}` |

Source: `api/v1/agents.py`

### 2.3 Chat (streaming)

| Method | HTTP | Path | Auth | Request | SSE |
|--------|------|------|------|---------|-----|
| `chatStream(agentId, message, opts?)` | POST | `/api/worker` | middleware | `ChatRequest` (§3.2) | Worker SSE (§4.2) |
| `chatStreamSimple(...)` | POST | `/api/chat` | middleware | `ChatRequest` | Chat SSE (§4.1) |

**Recommendation:** Use `/api/worker` for IDE agent chat — enables tool execution + confirmation flow. Use `/api/chat` only for tool-free conversational mode.

Non-streaming (`stream: false`):
- `/api/worker` → `{conversation_id, model, role:"pilot", response, steps[], iterations}`
- `/api/chat` → `{conversation_id, model, role, response, routing, artifacts[]}`

### 2.4 Tool confirmation

| Method | HTTP | Path | Auth | Request | Response |
|--------|------|------|------|---------|----------|
| `confirmTool(id, approved, remember?)` | POST | `/api/worker/confirm` | middleware | `ConfirmRequest` (§3.3) | `{ok: true}` |

Flow: SSE emits `confirm_tool` → IDE shows dialog → POST confirm → engine resumes `PilotLoop`.

### 2.5 Capability map & routing

| Method | HTTP | Path | Auth | Response |
|--------|------|------|------|----------|
| `getCapabilities()` | GET | `/api/capabilities` | middleware | Full map or `{status:"no_data"}` |
| `getRoutingGaps()` | GET | `/api/gaps` | middleware | `{gaps: [...]}` |
| `listRoutingOverrides()` | GET | `/api/routing/overrides` | `require_auth` | `{overrides: []}` |
| `setRoutingOverride(category, modelId)` | POST | `/api/routing/overrides` | auth | `{ok, category, model_id}` |
| `deleteRoutingOverride(category)` | DELETE | `/api/routing/overrides/{category}` | auth | `{ok, removed}` |
| `getRecommendedRouting()` | GET | `/api/routing/recommended` | middleware | `{recommended, current, has_remote, has_local}` |

Model list for UI picker (no hardcoded model names in IDE):
- GET `/api/v1/models` → OpenAI-style list + virtual `auto` model
- GET `/api/v1/categories` → chat/embedding category definitions
- GET `/api/v1/categories/{id}/models` → models per category

### 2.6 Feedback

| Method | HTTP | Path | Auth | Request | Response |
|--------|------|------|------|---------|----------|
| `sendAgentFeedback(agentId, body)` | POST | `/api/v1/agents/{id}/feedback` | auth | `{rating, input?, output?, reason?, annotation?, category?, context?}` | `{data: entry}` |

Legacy (conversation-indexed): POST `/api/feedback` with `{conversation_id, message_index, rating, agent_id?}`.

### 2.7 TO BE EXPOSED BY ENGINE

Features referenced in bootstrap Phase 2.6 that **do not yet have a persistent engine API**:

| Feature | Status | Workaround today |
|---------|--------|------------------|
| **Per-agent tool whitelist** (persisted) | **NOT IN API** | Per-request `disabled_tools` / `tools_enabled` on `ChatRequest` only |
| **Per-agent routing mode** (single/verify/ensemble persisted) | **NOT IN API** | Per-request `mode` on `ChatRequest`; routing overrides are per-category at router level |
| **Dedicated engine↔IDE tool-delegation endpoint** | **NOT NEEDED** | IDE executes tools locally when engine requests via SSE `confirm_tool` + local bridge; engine runs tools server-side today |

These are **engine-side gaps** — do not build fake IDE endpoints. Escalate to Marten before implementing.

---

## 3. Request / response schemas

### 3.1 `AgentPersona` (`core/agents/schema.py:526–610`)

```typescript
interface AgentPersona {
  id: string;
  name: string;
  role: string;           // legacy
  category: string;       // canonical
  version: number;        // default 3
  preferred_model?: string | null;
  persona: {
    description?: string;
    avatar_icon?: string;
    avatar_color?: string;
    tone?: string;
    language?: string;
  };
  specializations: Array<{name: string; level?: string}>;
  memory: object;
  intelligence: {
    system_prompt: string;
    domain_rules?: string[];
    examples?: object[];
    anti_patterns?: string[];
  };
  knowledge: { documents: object[]; max_context_tokens: number };
  learning: object;
  benchmarks: object;
  shortcuts: object[];
  simezu: { persona_id?: string; visibility?: string; published?: boolean };
  stats: object;
}
```

**IDE-relevant writable fields** (PATCH `/api/v1/agents/{id}`):
- `name`, `role`, `system_prompt`, `preferred_model`, `description`, `visibility`

**Marketplace slug:** `simezu.persona_id` when published.  
**Preferred model:** `preferred_model` — engine may use as routing hint; IDE displays only if present in agent object (never hardcode model names).

### 3.2 `ChatRequest` (`server.py:418–451`)

```typescript
interface ChatRequest {
  prompt: string;
  images?: string[] | null;          // base64 multimodal
  model_hint?: string | null;
  model_id?: string | null;          // bypasses router
  conversation_id?: string | null;
  project_id?: string | null;
  persona_id?: string | null;        // canonical agent binding
  agent_id?: string | null;          // deprecated alias for persona_id
  context?: Array<{type: "file"|"text"|"embedding_query"; value: string}> | null;
  stream?: boolean;                  // default true
  mode?: "auto"|"single"|"plan"|"verify"|"ensemble" | null;
  worker_count?: string | null;      // "auto" or "2".."5"
  pilot_tools?: boolean | null;
  disabled_tools?: string[] | null;
  tools_enabled?: boolean | null;
}
```

**IDE usage:**
```json
{
  "prompt": "user message",
  "persona_id": "<agent-uuid>",
  "conversation_id": "<optional-uuid>",
  "stream": true
}
```

### 3.3 `ConfirmRequest` (`server.py:453–456`)

```typescript
interface ConfirmRequest {
  confirmation_id: string;
  approved: boolean;
  remember?: "" | "session";  // session-level auto-approve for tool name
}
```

### 3.4 `RoutingDecision` (`core/smart_router.py:86–123`)

Emitted in SSE `meta` and `routing` events:

```typescript
interface RoutingDecision {
  model: string;
  category: string;
  confidence: number;       // 0–1 float from engine; public API may scale to 0–100
  reasoning: string;
  alternatives: string[];
  mode: "single" | "verify" | "ensemble";
  provider: string;
  forced: boolean;
  override_source?: "category" | "request" | null;
  ranked_models: Array<{
    model_id: string;
    score: number;
    rank: number;
    confidence: number;
    provider: string;
    is_local: boolean;
    cost_per_1k: number;
  }>;
}
```

**Mode selection logic** (`_select_mode`, `smart_router.py:169–186`):
1. Verify keywords in prompt → `"verify"`
2. confidence ≥ 0.8 → `"single"`
3. confidence ≥ 0.5 → `"verify"`
4. else → `"ensemble"`

**Routing precedence** (`route()`, `smart_router.py:397–552`): classify → rank from capability map → static fallback → per-category user overrides → cost guard.

---

## 4. SSE event contracts

All SSE responses use `Content-Type: text/event-stream`. Events are JSON objects in `data: {...}\n\n` lines.

### 4.1 `/api/chat` — single-mode events (`_stream_response`, `server.py:4069+`)

| Event `type` | Payload highlights | IDE use |
|--------------|-------------------|---------|
| `model_switch` | `{from, to, reason}` | Vision auto-switch notification |
| `meta` | `{model, responded_by, role, conversation_id, agent_id?, agent_name?, routing?}` | **Show which model answers** |
| `routing` | `{model, reasoning, alternatives, category, mode}` | Routing transparency |
| `timing` | `{ttft_ms}` | Performance display |
| `chunk` | `{content}` | Stream tokens to chat UI |
| `status` | status messages | Progress |
| `artifact` | generated file metadata | File links |
| `error` | `{content}` | Error display |
| `done` | end marker | Close stream |

Plan-mode adds events from `core/plan_events.py` (e.g. `plan_generated`, `worker_chunk`, `synthesis_done`).

### 4.2 `/api/worker` — tool-enabled events (`_stream_agent_response`, `server.py:2245+`)

| Event `type` | Payload highlights | IDE use |
|--------------|-------------------|---------|
| `meta` | model + agent info | Model transparency |
| `confirm_tool` | `{confirmation_id, tool, args, iteration}` | **IDE confirmation dialog** |
| `confirm_auto` | `{tool, args, approved, iteration}` | Session auto-approve/deny |
| `tool_call` | tool invocation | Step display |
| `tool_result` | tool output | Step display |
| `step` | iteration summary | Progress |
| `chunk` | text tokens | Streaming answer |
| `answer` | final answer block | Completion |
| `done` | end | Close stream |
| `error` | error | Error display |

**Confirmation timeout:** 120 seconds auto-deny (`server.py:2530–2535`).

### 4.3 Tool bridge contract (Phase 2.4)

Today the engine executes tools **server-side** via `PilotLoop` + `ToolRegistry`. The IDE tool bridge (Phase 2.4) must:

1. Intercept destructive tool requests when engine delegates to IDE (future) OR
2. Mirror confirmation UX for engine-side `confirm_tool` events and optionally re-execute via Theia services for IDE-local workspace scope

**Current engine tools** (`core/tools.py:133–180`, local mode):

| Tool | Confirmation required | Category |
|------|----------------------|----------|
| `file_read` | No | filesystem |
| `file_write` | **Yes** | filesystem |
| `shell_exec` | **Yes** | system |
| `web_fetch` | No | network |
| `project_search` | No | search |
| `http_request` | No | network |
| `check_security_headers` | No | network |
| `port_scan` | No | network |
| `list_directory` | No | filesystem |
| `generate_document` | No | filesystem |

Hosted (Simezu) mode: local filesystem/shell tools **not registered** — worker returns 409.

**PilotLoop interface** (`core/agent_loop.py:65–101`):
```python
async def run(prompt, system="", on_step=None, on_chunk=None) -> PilotResult
# PilotResult: answer, steps[], iterations, model, generated_files[]
# PilotStep: iteration, tool_name, tool_args, result, error, requires_confirmation
```

---

## 5. Full API inventory

### 5.1 `/api/v1/*` router (`api/v1/router.py`)

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/api/v1/chat/completions` | `api/v1/chat.py` | auth |
| GET | `/api/v1/agents` | `api/v1/agents.py` | auth |
| POST | `/api/v1/agents` | `api/v1/agents.py` | auth |
| GET | `/api/v1/agent-categories` | `api/v1/agents.py` | auth |
| POST | `/api/v1/agents/wizard` | `api/v1/agents.py` | auth |
| GET/PATCH/DELETE | `/api/v1/agents/{id}` | `api/v1/agents.py` | auth |
| GET/POST/PATCH/DELETE | `/api/v1/agents/{id}/knowledge[/{doc_id}]` | `api/v1/agents.py` | auth |
| POST | `/api/v1/agents/{id}/implicit-signal` | `api/v1/agents.py` | auth |
| POST | `/api/v1/agents/{id}/feedback` | `api/v1/agents.py` | auth |
| POST | `/api/v1/agents/{id}/regenerate-prompt` | `api/v1/agents.py` | auth |
| POST/GET/DELETE | `/api/v1/agents/{id}/publish[/published]` | `api/v1/agents.py` | auth |
| POST/GET | `/api/v1/agents/{id}/benchmark/golden[/history|/latest]` | `api/v1/agents.py` | auth |
| GET | `/api/v1/models`, `/{model_id}` | `api/v1/models.py` | auth |
| GET | `/api/v1/categories`, `/{id}/models` | `api/v1/categories.py` | auth |
| POST | `/api/v1/models/{id}/activations` | `api/v1/categories.py` | auth |
| GET | `/api/v1/usage/summary`, `/by-model` | `api/v1/usage.py` | auth |
| POST/GET/DELETE | `/api/v1/api-keys[/{id}]` | `api/v1/keys.py` | auth |
| GET | `/api/v1/auth/whoami` | `api/v1/auth.py` | auth |
| POST/GET/DELETE | `/api/v1/tenant-providers[/{id}]` | `api/v1/tenant_providers.py` | auth + tenant admin |
| POST/GET/DELETE | `/api/v1/user-providers[/{id}]` | `api/v1/user_providers.py` | auth |
| POST/GET/DELETE | `/api/v1/transcribe/*` | `api/v1/voice.py` | auth (models list: no dep) |

### 5.2 `/api/admin/policy/*` (`api/admin_policy.py`)

Super-admin only: GET/PUT/PATCH/DELETE policy, provider/model toggles, audit log.

### 5.3 Legacy `server.py` routes (selected — full list in source)

**Chat / agents / routing:** `/api/chat`, `/api/worker`, `/api/worker/confirm`, `/api/pilot`, `/api/pilot/confirm`, `/api/plan/{id}/execute|cancel`, `/api/verify`, `/api/ensemble`, `/api/agents/*`, `/api/capabilities`, `/api/gaps`, `/api/routing/*`, `/api/feedback`, `/api/conversations/*`, `/api/projects/*`

**Infrastructure:** `/api/health`, `/api/models`, `/api/tools`, `/api/providers/*`, `/api/benchmark/*`, `/api/settings`, `/api/mcp/config`

**Auth / billing:** `/api/auth/*`, `/api/billing/*`, `/api/team/*`, `/api/webhooks/stripe`

---

## 6. EngineClient configuration (Phase 2.1 preview)

Theia preferences (not yet implemented):

| Preference | Default | Description |
|------------|---------|-------------|
| `soriku.engine.baseUrl` | `http://127.0.0.1:8765` | Engine root URL (local or hosted) |
| `soriku.engine.authToken` | `""` | Optional Bearer token (Simezu/hosted) |

Headers when token present:
```
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream   # for SSE POST endpoints
```

---

## 7. Phase 2 implementation order (confirmed)

1. **2.1** `extensions/soriku-engine-client` — `EngineClient` against this contract
2. **2.2** `extensions/soriku-agents-panel` — `listAgents()`
3. **2.3** `extensions/soriku-chat` — `chatStream()` via `/api/worker`
4. **2.4** `extensions/soriku-tools-bridge` — `confirm_tool` + Theia filesystem/task services
5. **2.5** `extensions/soriku-auth` — Simezu connect (opt-in)
6. **2.6** `extensions/soriku-agent-customization` — PATCH agent + feedback (tool whitelist blocked until engine exposes it)

---

## 8. Review checklist for Marten

- [ ] Engine default URL `8765` accepted for IDE preference (vs bootstrap `8000`)
- [ ] `/api/worker` confirmed as primary agent chat endpoint for IDE
- [ ] Per-agent tool whitelist acknowledged as engine gap (Phase 2.6 partial)
- [ ] No invented endpoints in this document
- [ ] Go/no-go for Phase 2.1 `EngineClient` implementation
