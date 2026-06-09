# AUDIT 1 — Soriku Feature Inventory

**Date:** 2026-06-08  
**Sources:** `docs/VISION.md`, `docs/PHASE_2_ENGINE_CONTRACT.md`, Soriku engine (`/Users/martentiman/Sites/soriku`)

---

## Feature list

### 1. Model orchestratie / SmartRouter exposure

**Description:** Toon en beïnvloed hoe Soriku taken routeert naar modellen op basis van capability scores en user overrides — niet hardcoded modelkeuze.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `SmartRouter` via `/api/routing/recommended`, `/api/routing/overrides`, `/api/v1/models`, `/api/v1/categories` |
| **IDE UI** | Routing overrides panel; recommended-routing widget; model picker (geen hardcoded namen) |
| **Engine refs** | `server.py:5671+` (overrides), `api/v1/models.py`, `api/v1/categories.py` |

---

### 2. Conductor + Workers (multi-agent flows)

**Description:** Plan/Task/WorkerResult flows waarbij de engine een plan decomposeert en meerdere workers parallel of sequentieel uitvoert.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `core/conductor.py`, `/api/worker` met plan-mode (`mode: "plan"`) |
| **IDE UI** | Chat metadata panel (plan steps, worker assignments); optioneel dedicated orchestration view |
| **Engine refs** | `server.py:2245` (`worker_chat`), `ChatRequest.mode` (`server.py:431-437`) |

---

### 3. Pilot mode (multi-step tool-use loops)

**Description:** Single-agent tool execution loop met bevestiging voor destructieve acties; combineerbaar met plan-mode via `pilot_tools`.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `/api/worker` PilotLoop, `/api/worker/confirm` |
| **IDE UI** | Chat widget + confirmation dialog; pilot toggle in chat toolbar |
| **Engine refs** | `server.py:2469` (confirm), SSE event `confirm_tool` |

---

### 4. Training agents (feedback loop, persona refinement)

**Description:** Gebruiker geeft feedback op agent-antwoorden; engine verwerkt dit voor persona/system-prompt verbetering.

| Field | Value |
|-------|-------|
| **Engine status** | **Gedeeltelijk** — `/api/v1/agents/{id}/feedback` bestaat; volledige training pipeline in ontwikkeling |
| **IDE UI** | Thumbs up/down in chat; agent editor (system prompt, persona fields) |
| **Engine refs** | `api/v1/agents.py` (feedback endpoint) |
| **Engine gap** | Geen persistent per-agent tool whitelist API; geen persistent per-agent routing mode API (zie Phase 2 contract §2.7) |

---

### 5. External model integratie (BYOK keystore)

**Description:** Gebruiker voegt eigen API-providers toe (OpenAI, Anthropic, etc.); engine beheert keys server-side.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `/api/providers/*`, `/api/v1/keys`, `/api/v1/user_providers`, `/api/v1/tenant_providers` |
| **IDE UI** | Providers preferences page; add/test/delete provider dialogs |
| **Engine refs** | `server.py:1266+`, `api/v1/keys.py`, `api/v1/user_providers.py` |
| **Note** | BYOK keys leven in engine, niet in IDE keychain (behalve Soriku auth token zelf) |

---

### 6. Capability map

**Description:** Zichtbaarheid van scores per model per categorie; gap analysis.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `/api/capabilities`, `/api/gaps`, `/api/v1/capabilities` (admin) |
| **IDE UI** | Dedicated capability map panel (heatmap/table); gap warnings |
| **Engine refs** | `server.py:981`, `server.py:1012` |

---

### 7. Multi-model synthesis modes (single / verify / ensemble)

**Description:** UI om synthesis mode te kiezen: single-model, verify (consensus), ensemble (merge).

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `ChatRequest.mode`: `single`, `plan`, `verify` (→ plan+consensus), `ensemble` (→ plan+merge); `VerifyPipeline`, `EnsemblePipeline` in `server.py:387-388` |
| **IDE UI** | Mode selector in chat/agent toolbar (dropdown of segmented control) |
| **Engine gap** | Geen persistent per-agent mode — alleen per-request `mode` field |

---

### 8. Persona marketplace (Simezu)

**Description:** Community-gemaakte persona's publiceren en importeren via Simezu-integratie.

| Field | Value |
|-------|-------|
| **Engine status** | **Gedeeltelijk** — `SimezuConnector` (`core/agents/simezu_connector.py`) met publish/fetch/unpublish APIs |
| **IDE UI** | Marketplace browser panel; import-to-workspace actie |
| **Engine refs** | `simezu_connector.py`, Simezu auth in `core/auth/simezu.py` |

---

### 9. Agent chat (streaming, model transparency)

**Description:** Per-agent chat met SSE-streaming; toont transparant welk model antwoordt en waarom (routing info).

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `/api/worker` (tools+SSE), `/api/chat` (no tools); SSE events include model/routing metadata |
| **IDE UI** | Chat widget (sidebar or bottom panel); model badge per message; routing explanation tooltip |
| **Engine refs** | `server.py:2245`, `api/v1/chat.py` |

---

### 10. Tool execution bridge (file/shell/web via Theia)

**Description:** Wanneer engine tools server-side niet kan uitvoeren, delegeert IDE lokale acties via Theia services (FileService, TaskService).

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat server-side** — engine tool registry (`/api/tools`); IDE-bridge via SSE `confirm_tool` flow |
| **IDE UI** | Confirmation dialog; tool execution status in chat; geen apart endpoint nodig |
| **Engine refs** | `server.py:835` (tools list), `server.py:2469` (confirm) |
| **Design** | Engine runs tools server-side today; IDE bridge executes locally when engine requests via SSE |

---

### 11. Routing overrides (user/tenant level)

**Description:** Gebruiker overschrijft per categorie welk model de router kiest.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — GET/POST/DELETE `/api/routing/overrides` |
| **IDE UI** | Overrides editor (category → model picker) |
| **Engine refs** | `server.py:5671-5697` |

---

### 12. Auth (Simezu OAuth + local-only fallback)

**Description:** Hosted mode: Simezu OAuth + Bearer token. Local mode: geen auth vereist.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — `/api/auth/mode`, `/api/auth/simezu/proxy/*`, `api/v1/auth.py` |
| **IDE UI** | Login dialog (hosted); token preference; auth mode indicator in statusbar |
| **Engine refs** | `core/auth/middleware.py`, `core/auth/simezu.py` |

---

### 13. Benchmark runner trigger (optioneel)

**Description:** Start capability benchmark vanuit IDE om scores te verversen.

| Field | Value |
|-------|-------|
| **Engine status** | **Bestaat** — POST `/api/benchmark/run`, POST `/api/benchmark/stop`; CLI `python3 -m benchmarks` |
| **IDE UI** | Button/command in capability map panel ("Run benchmark") |
| **Engine refs** | `server.py:1506`, `benchmarks/runner.py` |
| **Note** | Optioneel — engine kan ook via CLI/scheduler draaien |

---

### 14. Hosted vs local engine switching

**Description:** Zelfde IDE-build, andere engine URL (lokaal `127.0.0.1:8765` vs hosted `api.soriku.ai`).

| Field | Value |
|-------|-------|
| **Engine status** | **N/A** (IDE-only config) |
| **IDE UI** | Preference `soriku.engine.baseUrl` — **al geïmplementeerd** in `soriku-engine-client` |
| **IDE refs** | `theia-extensions/soriku-engine-client/src/browser/soriku-engine-preferences.ts` |

---

### 15. RAG / project context (toekomstige fase)

**Description:** Project-aware context injection (files, embeddings, semantic search) in agent prompts.

| Field | Value |
|-------|-------|
| **Engine status** | **Gedeeltelijk** — `project_id` op `ChatRequest`; `project_search` tool; nomic-embed-text endpoint (`server.py:6336`); geen volledige hosted RAG pipeline |
| **IDE UI** | Context picker (workspace files); project selector; @-mentions |
| **Engine refs** | `ChatRequest.project_id` (`server.py:424`), tool framework in `core/tools.py` |
| **Note** | VISION.md noemt hosted RAG als soriku.ai feature; lokaal beperkt tot tools + context items |

---

## Engine gaps (do not build fake IDE endpoints)

From [`docs/PHASE_2_ENGINE_CONTRACT.md`](PHASE_2_ENGINE_CONTRACT.md) §2.7:

| Gap | Impact on IDE |
|-----|---------------|
| No persistent per-agent tool whitelist API | Per-request `disabled_tools` / `tools_enabled` only |
| No persistent per-agent routing mode API | Per-request `mode` only; overrides are per-category |
| No dedicated engine↔IDE tool-delegation endpoint | Not needed — SSE `confirm_tool` + local bridge |

---

## IDE extension mapping (planned packages)

| Feature cluster | Planned `@soriku/*` extension |
|-----------------|------------------------------|
| Engine HTTP/SSE | `soriku-engine-client` (**exists**) |
| Agents panel | `soriku-agents-panel` |
| Chat UI | `soriku-chat` |
| Tool bridge | `soriku-tools-bridge` |
| Auth | `soriku-auth` |
| Capability map + benchmark | `soriku-capability-map` |
| Routing overrides | `soriku-routing-overrides` |
| Agent customization | `soriku-agent-customization` |
| Providers/BYOK UI | `soriku-providers` (or part of preferences) |
| Branding/theme | `theia-extensions/product` + `@soriku/theme` (future) |
