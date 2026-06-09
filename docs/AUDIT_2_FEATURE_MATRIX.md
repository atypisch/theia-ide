# AUDIT 2 — Feature × Theia Package Matrix

**Date:** 2026-06-08  
**Theia source:** `node_modules/@theia/*` @ `1.73.0-next.2` (no local `theia/` clone)  
**Classification legend:** ADDITIVE < REBIND < PATCH < PEER (strictest wins per path)

**Pad 1:** Integrate via `@theia/ai-*` stack (AgentService, ChatAgent, LanguageModelProvider, ToolInvocationRegistry)  
**Pad 2:** Integrate via `@soriku/*` peer extensions + Theia infrastructure primitives only

---

## Feature: Model orchestratie / SmartRouter

**Soriku-component:** Engine `SmartRouter`, `/api/routing/recommended`, `/api/routing/overrides`, `/api/v1/models`  
**UI-vereisten:** Routing panel, recommended-routing widget, model picker

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `ViewContribution` + `PreferenceContribution` for panel/commands (`@theia/core` contribution pattern) |
| `@theia/ai-core` | REBIND | PEER | Pad1: `LanguageModelRegistry.selectLanguageModel()` (`language-model.d.ts:374`) selects by agent+purpose — no SmartRouter/capability-score concept. Custom `LanguageModelProvider` (`language-model.d.ts:323-324`) can proxy to engine but cannot expose routing table without separate UI. Pad2: skip `ai-core`; use `EngineClient` |
| `@theia/ai-chat-ui` | REBIND | PEER | Pad1: built-in chat has model selector tied to `LanguageModelRegistry`, not Soriku routing overrides. Pad2: own chat widget |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER (ai-core unused) + ADDITIVE (routing UI)  
**Fork-vereist:** Nee

---

## Feature: Conductor + Workers

**Soriku-component:** `core/conductor.py`, `/api/worker` plan-mode, SSE plan/step events  
**UI-vereisten:** Plan steps view, worker assignment metadata in chat

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | Custom view widget for plan visualization |
| `@theia/ai-core` | REBIND | PEER | Pad1: `Agent` interface (`agent.d.ts:23-49`) models single agents with `languageModelRequirements` — no Plan/Task/WorkerResult types. `AgentService.registerAgent()` (`agent-service.d.ts:38`) cannot represent Conductor decomposition |
| `@theia/ai-chat` | REBIND | PEER | Pad1: `ChatAgent.invoke()` (`chat-agents.d.ts:61`) is single-agent request/response. `agent-delegation-tool.d.ts` delegates to another agent, not Conductor workers. Pad2: custom SSE parser for plan events |
| `@theia/ai-chat-ui` | REBIND | PEER | No UI primitive for multi-worker orchestration progress |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Pilot mode (tool-use loops)

**Soriku-component:** `/api/worker` PilotLoop, `/api/worker/confirm`, SSE `confirm_tool`  
**UI-vereisten:** Chat + confirmation dialog

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `ConfirmDialog` / `MessageService` for destructive ops |
| `@theia/ai-core` | REBIND | PEER | Pad1: `ToolInvocationRegistry.registerTool()` (`tool-invocation-registry.d.ts:14`) registers Theia-native tools; engine tool schema differs. Must bridge formats |
| `@theia/ai-chat` | REBIND | PEER | Pad1: `ChatToolRequestService` handles tool confirmation in Theia format — different from engine SSE `confirm_tool` event shape. Adapter layer needed, not a source patch |
| `@theia/filesystem` | ADDITIVE | ADDITIVE | Injectable `FileService` for local tool execution |
| `@theia/task` | ADDITIVE | ADDITIVE | Injectable `TaskService` for `shell_exec` bridge |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Training agents / feedback

**Soriku-component:** `/api/v1/agents/{id}/feedback`, `/api/v1/agents` PATCH (system_prompt, persona)  
**UI-vereisten:** Agent editor, feedback buttons in chat

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | Editor widget, commands |
| `@theia/ai-core` | REBIND | PEER | Pad1: `PromptService` manages prompt templates locally (`agent.d.ts:47`) — not engine-backed persona store. `AgentService` agents are Theia-defined, not engine `AgentPersona` |
| `@theia/ai-chat-ui` | REBIND | PEER | Pad1: feedback UI not built-in; would extend chat response renderer. Pad2: custom feedback component |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: External models / BYOK

**Soriku-component:** `/api/providers/*`, `/api/v1/keys`, `/api/v1/user_providers`  
**UI-vereisten:** Provider management preferences page

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `PreferenceContribution` + custom preference widget |
| `@theia/ai-openai` etc. | PEER | PEER | Pad1: 10+ provider packages manage keys client-side and call providers directly — **conflicts** with Soriku engine owning provider registry. Would duplicate BYOK in IDE and engine |
| `@theia/preferences` | ADDITIVE | ADDITIVE | Preference schema for UI shell |

**Conclusie Pad1:** PEER (provider packages fight engine ownership)  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Capability map

**Soriku-component:** `/api/capabilities`, `/api/gaps`  
**UI-vereisten:** Dedicated capability map panel

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `ViewContribution` + tree/table widget |
| `@theia/ai-core` | — | PEER | No capability map concept in `LanguageModelMetaData` (`language-model.d.ts:325-335`) — only per-model status, no category scores |
| `@theia/ai-core-ui` | — | PEER | AI Configuration View shows agents/models, not benchmark scores |

**Conclusie Pad1:** ADDITIVE (but requires carrying entire `@theia/ai-*` stack for unrelated chat)  
**Conclusie Pad2:** ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Multi-model synthesis modes

**Soriku-component:** `ChatRequest.mode` (`single`/`plan`/`verify`/`ensemble`), `VerifyPipeline`, `EnsemblePipeline`  
**UI-vereisten:** Mode selector in chat toolbar

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | Toolbar contribution, preference |
| `@theia/ai-core` | REBIND | PEER | Pad1: `LanguageModel.request()` (`language-model.d.ts:344`) is 1:1 model invocation — no verify/ensemble pipeline. Would need custom `LanguageModel` wrapping engine `mode` param |
| `@theia/ai-chat` | REBIND | PEER | Pad1: `ChatMode` interface (`chat-agents.d.ts:48-52`) is agent-local mode (panel/editor), not synthesis mode. No verify/ensemble UI hook |
| `@theia/ai-chat-ui` | REBIND | PEER | Built-in chat UI has no synthesis mode selector |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Persona marketplace (Simezu)

**Soriku-component:** `SimezuConnector`, Simezu auth proxy  
**UI-vereisten:** Marketplace browser panel, import action

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `ViewContribution`, `OpenHandler` |
| `@theia/ai-core` | — | PEER | No marketplace concept in Agent framework |
| `@theia/mini-browser` | ADDITIVE | ADDITIVE | Optional: embed Simezu web UI in panel |

**Conclusie Pad1:** ADDITIVE  
**Conclusie Pad2:** ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Agent chat (SSE, model transparency)

**Soriku-component:** `/api/worker`, SSE stream with model/routing metadata  
**UI-vereisten:** Chat widget, model badge, routing explanation

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | Widget, status bar |
| `@theia/ai-chat` | REBIND | PEER | Pad1: `AbstractChatAgent` (`chat-agents.d.ts:64+`) expects `LanguageModelStreamResponse` format (`language-model.d.ts:312-314`), not engine SSE events. Full adapter required. Routing "why" not in Theia response model |
| `@theia/ai-chat-ui` | REBIND | PEER | Pad1: could reuse chat panel chrome but must replace stream parser and model display. Pad2: `@soriku/chat` with `EngineClient.chatStream()` |
| `@theia/ai-core` | REBIND | PEER | Pad1: custom `LanguageModel` provider proxying to `/api/worker` — fragile, loses engine-specific metadata |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** PEER + ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Tool execution bridge

**Soriku-component:** Engine `/api/tools`, SSE `confirm_tool`, local Theia services  
**UI-vereisten:** Confirmation dialog, tool status in chat

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `MessageService`, DI bindings |
| `@theia/filesystem` | ADDITIVE | ADDITIVE | `FileService` — injectable, no source edit |
| `@theia/workspace` | ADDITIVE | ADDITIVE | Workspace roots for path resolution |
| `@theia/task` | ADDITIVE | ADDITIVE | `TaskService` for shell commands |
| `@theia/terminal` | ADDITIVE | ADDITIVE | Optional terminal integration; existing asar patch is packaging-only |
| `@theia/ai-core` | ADDITIVE | PEER | Pad1: `ToolInvocationRegistry.registerTool()` (`tool-invocation-registry.d.ts:14`) is the official extension point. Pad2: own tool registry in `@soriku/tools-bridge` |

**Conclusie Pad1:** ADDITIVE  
**Conclusie Pad2:** ADDITIVE (PEER only for ai-core replacement, not for tool bridge itself)  
**Fork-vereist:** Nee

---

## Feature: Routing overrides

**Soriku-component:** `/api/routing/overrides` CRUD  
**UI-vereisten:** Overrides editor panel

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | View + form widget |
| `@theia/preferences` | ADDITIVE | ADDITIVE | Could store UI state; engine is source of truth |
| `@theia/ai-core` | — | PEER | `LanguageModelRegistry.patchLanguageModel()` (`language-model.d.ts:376`) patches model metadata, not routing overrides per category |

**Conclusie Pad1:** ADDITIVE  
**Conclusie Pad2:** ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Auth (Simezu OAuth + local)

**Soriku-component:** `/api/auth/mode`, `/api/auth/simezu/proxy/*`, `api/v1/auth.py`  
**UI-vereisten:** Login dialog, token preference, statusbar indicator

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `PreferenceContribution`, statusbar contribution |
| `@theia/ai-core-ui` | REBIND | PEER | Pad1: AI preferences UI manages provider API keys (`ai-core-ui` preferences) — different from Simezu OAuth flow |
| `@theia/electron` | ADDITIVE | ADDITIVE | Electron main process for OAuth redirect / keychain (if needed) — via extension, not core patch |

**Conclusie Pad1:** REBIND  
**Conclusie Pad2:** ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Benchmark runner trigger

**Soriku-component:** POST `/api/benchmark/run`, `benchmarks/runner.py`  
**UI-vereisten:** Button/command in capability panel

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `CommandContribution` + progress notification |
| `@theia/ai-core` | — | PEER | No benchmark concept in AI framework |

**Conclusie Pad1:** ADDITIVE  
**Conclusie Pad2:** ADDITIVE  
**Fork-vereist:** Nee

---

## Feature: Hosted vs local engine switching

**Soriku-component:** Runtime `soriku.engine.baseUrl` preference  
**UI-vereisten:** Preferences entry (already implemented)

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | `PreferenceContribution` |
| `@theia/ai-core` | ADDITIVE | PEER | Pad1: could use `ai-features` preferences for endpoint — but Soriku-specific. Pad2: **already in** `soriku-engine-client` |

**Conclusie Pad1:** ADDITIVE  
**Conclusie Pad2:** ADDITIVE (implemented)  
**Fork-vereist:** Nee

---

## Feature: RAG / project context (future)

**Soriku-component:** `ChatRequest.project_id`, `context[]`, `project_search` tool, embeddings endpoint  
**UI-vereisten:** Context picker, @-mentions, project selector

| Theia-package | Pad1 | Pad2 | Toelichting |
|---|---|---|---|
| `@theia/core` | ADDITIVE | ADDITIVE | Commands, quick-pick |
| `@theia/workspace` | ADDITIVE | ADDITIVE | `WorkspaceService` for file roots |
| `@theia/ai-chat` | ADDITIVE | PEER | Pad1: `file-chat-variable-contribution.d.ts`, `context-variables.d.ts` — official context variable extension points. Could wire workspace files into Theia chat context |
| `@theia/editor` / `@theia/monaco` | ADDITIVE | ADDITIVE | Future tab-completion: Monaco `CompletionItemProvider` pattern exists (`textmate-snippet-completion-provider.d.ts:5`) — no source patch required |
| `@theia/ai-code-completion` | REBIND | PEER | Pad1: could extend for engine-backed completion. Pad2: custom `@soriku/completion` extension |

**Conclusie Pad1:** REBIND (for completion integration) / ADDITIVE (for context)  
**Conclusie Pad2:** ADDITIVE (context) + PEER (completion, future)  
**Fork-vereist:** Nee

---

## Pre-existing non-feature PATCH

**Item:** `patches/@theia+terminal+1.72.1.patch`  
**Package:** `@theia/terminal` (not `@theia/core`)  
**Classification:** PATCH — `shell-integration-injector.js:80` asar path fix  
**Feature-driven:** No — Electron packaging (documented in `ADOPTER.md`)  
**Upstream issue:** Known Electron+asar pattern; mitigated via `patch-package` + `asarUnpack`  
**Fork-vereist:** Nee (standard adopter practice)

---

## Pad comparison summary

| Dimension | Pad1 (`@theia/ai-*`) | Pad2 (`@soriku/*`) |
|-----------|----------------------|---------------------|
| Extension points used | `AgentService`, `ChatAgent`, `LanguageModelProvider`, `ToolInvocationRegistry` — all exist without source patches | `ViewContribution`, `PreferenceContribution`, `CommandContribution`, injectable Theia services |
| Orchestration fit | Poor — Theia AI is provider-centric; no Conductor, SmartRouter, capability map, synthesis modes | Native — `EngineClient` maps 1:1 to engine API |
| Dependency weight | 23 `@theia/ai-*` packages + 10 provider adapters | 1 `@theia/core` peer dep per extension |
| PATCH required | None for features (only adapter fragility / REBIND) | None |
| PEER required | Provider packages conflict with engine BYOK | `@theia/ai-*` suite replaced, not patched |
| Risk on upstream update | High — implicit contract on `ChatAgent.invoke()`, `LanguageModel.request()` internals | Low — stable Theia contribution APIs |
