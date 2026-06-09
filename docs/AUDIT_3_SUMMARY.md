# AUDIT 3 — Aggregation Summary

**Date:** 2026-06-08  
**Input:** [`AUDIT_2_FEATURE_MATRIX.md`](AUDIT_2_FEATURE_MATRIX.md)

---

## Repo reality (reframe)

This audit was prompted as a **Theia-core-fork** evaluation. Finding: **no core fork exists**. The repo is a **theia-ide adopter** with npm `@theia/*` dependencies. The architectural question reduces to:

> **Pad 1:** Build on `@theia/ai-*` (23 packages)  
> **Pad 2:** Replace AI layer with `@soriku/*` peer extensions (started: `soriku-engine-client`)

---

## Feature counts by strictest classification

### Pad 1 — `@theia/ai-*` integration

| Classification | Count | Features |
|----------------|-------|----------|
| **ADDITIVE** | 6 | Capability map, Persona marketplace, Tool bridge, Routing overrides, Benchmark trigger, Engine URL switching |
| **REBIND** | 8 | SmartRouter, Conductor+Workers, Pilot mode, Training/feedback, Multi-model synthesis, Agent chat, Auth, RAG/completion (future) |
| **PEER** | 1 | External models/BYOK (provider packages conflict with engine-owned keys) |
| **PATCH** | 0 | No feature requires Theia source edit |

### Pad 2 — `@soriku/*` peer extensions

| Classification | Count | Features |
|----------------|-------|----------|
| **ADDITIVE** | 7 | Capability map, Persona marketplace, Tool bridge, Routing overrides, Auth, Benchmark trigger, Engine URL switching |
| **PEER** | 8 | SmartRouter, Conductor+Workers, Pilot mode, Training/feedback, BYOK, Multi-model synthesis, Agent chat, RAG completion (future) |
| **REBIND** | 0 | — |
| **PATCH** | 0 | No feature requires Theia source edit |

**Note:** Pad 2 PEER means "do not use `@theia/ai-*`" — not "patch Theia source." All PEER features are implemented as new `theia-extensions/soriku-*` packages.

---

## PATCH inventory

### Feature-driven PATCH: **none**

No Soriku feature requires editing `@theia/core`, `@theia/editor`, `@theia/monaco`, or any other Theia package source.

### Packaging PATCH (pre-existing, not feature-driven)

| Package | File | Why PATCH | Upstream issue / alternative |
|---------|------|-----------|------------------------------|
| `@theia/terminal` | `lib/node/shell-integration-injector.js:80` | Electron asar archives break `__dirname` file access | Documented adopter pattern in `ADOPTER.md`: `asarUnpack` + path rewrite. No open Theia issue required — standard Electron packaging concern. Mitigation: `patch-package` (already in use) or bundler post-processing (see `esbuild.mjs` ripgrep plugin pattern) |

---

## REBIND risks (Pad 1 only)

Pad 1 leans on implicit contracts that are **not** stable extension APIs:

| Theia API | File | Risk |
|-----------|------|------|
| `ChatAgent.invoke()` | `ai-chat/lib/common/chat-agents.d.ts:61` | Engine SSE format ≠ `LanguageModelStreamResponse` |
| `LanguageModel.request()` | `ai-core/lib/common/language-model.d.ts:344` | No verify/ensemble/plan modes |
| `LanguageModelRegistry.selectLanguageModel()` | `ai-core/lib/common/language-model.d.ts:374` | No SmartRouter / capability-map routing |
| `Agent` interface | `ai-core/lib/common/agent.d.ts:23` | No Conductor/Worker types |
| Provider packages | `ai-openai`, `ai-anthropic`, etc. | Duplicate BYOK with engine `/api/providers` |

These are **fragile at upstream update** but do **not** require a fork — they require fighting the wrong abstraction.

---

## Packages to drop (Optie C / Pad 2)

Remove from `applications/browser/package.json`, `applications/electron/package.json`, `applications/electron-next/package.json`:

| Package | Reason |
|---------|--------|
| `@theia/ai-anthropic` | Provider adapter — engine owns providers |
| `@theia/ai-chat` | Replaced by `@soriku/chat` |
| `@theia/ai-chat-ui` | Replaced by `@soriku/chat` |
| `@theia/ai-claude-code` | Provider adapter |
| `@theia/ai-code-completion` | Future `@soriku/completion` |
| `@theia/ai-codex` | Provider adapter |
| `@theia/ai-copilot` | Provider adapter |
| `@theia/ai-core` | Replaced by `@soriku/engine-client` + extensions |
| `@theia/ai-core-ui` | Replaced by Soriku preferences UI |
| `@theia/ai-editor` | Replaced by Soriku editor integration (future) |
| `@theia/ai-google` | Provider adapter |
| `@theia/ai-history` | Engine owns conversation history |
| `@theia/ai-huggingface` | Provider adapter |
| `@theia/ai-ide` | IDE AI wiring — not needed |
| `@theia/ai-llamafile` | Provider adapter |
| `@theia/ai-mcp` | Soriku has own MCP server |
| `@theia/ai-mcp-server` | Soriku has own MCP server |
| `@theia/ai-mcp-ui` | Not needed |
| `@theia/ai-registry` | Remove from apps; product ext binding becomes unnecessary |
| `@theia/ai-ollama` | Engine owns Ollama |
| `@theia/ai-openai` | Provider adapter |
| `@theia/ai-scanoss` | Optional; not Soriku core |
| `@theia/ai-terminal` | Replaced by tool bridge |
| `@theia/ai-vercel-ai` | Provider adapter |

**Total: 23 packages** to remove from application dependencies.

Also update `theia-extensions/product`:
- Remove `@theia/ai-registry` dependency
- Remove `TheiaIDEAIRegistryConfiguration` (or repurpose for Soriku registry)

---

## Packages to keep upstream (Optie C)

All non-AI `@theia/*` infrastructure in `applications/browser/package.json`:

| Category | Packages (representative) |
|----------|---------------------------|
| Core shell | `@theia/core`, `@theia/workspace`, `@theia/preferences`, `@theia/messages` |
| Editor | `@theia/editor`, `@theia/monaco`, `@theia/file-search` |
| Files | `@theia/filesystem`, `@theia/bulk-edit` |
| SCM | `@theia/scm`, `@theia/scm-extra` |
| Terminal/tasks | `@theia/terminal`, `@theia/task`, `@theia/external-terminal` |
| Debug | `@theia/debug`, `@theia/memory-inspector` |
| Plugins | `@theia/plugin-ext`, `@theia/plugin-ext-vscode` |
| UI | `@theia/navigator`, `@theia/outline-view`, `@theia/getting-started` |
| Collaboration | `@theia/collaboration` |

These stay as **npm upstream dependencies** — no `packages/` vendoring.

---

## Current state vs Optie C target

| Aspect | Current (audit date) | Optie C target |
|--------|---------------------|----------------|
| Core fork | None | None |
| Theia infra | npm `@theia/*` @ `1.73.0-next.2` | Same — track upstream monthly |
| AI layer | 23× `@theia/ai-*` in app deps | 0× `@theia/ai-*`; 6–8× `theia-extensions/soriku-*` |
| Soriku extensions | 1 (`soriku-engine-client`) | 6–8 (agents, chat, tools-bridge, auth, capability-map, routing-overrides, customization) |
| Branding | Partial (uncommitted) | `theia-extensions/product` only |
| Patches | 1× terminal asar | Keep or replace with upstream fix |
| Committed divergence | 0 commits | Soriku work committed as extension PRs |

---

## Pad comparison (decision input)

| Criterion | Pad 1 (`@theia/ai-*`) | Pad 2 (`@soriku/*`) |
|-----------|----------------------|---------------------|
| Features requiring PATCH | 0 | 0 |
| Features requiring PEER | 1 | 8 (AI layer replacement) |
| Features requiring REBIND | 8 | 0 |
| Orchestration native fit | Poor | Excellent |
| Bundle size / dep count | +23 AI packages | +6–8 Soriku extensions |
| Upstream merge effort | High (AI API churn) | Low (stable contribution APIs) |
| Already started | No | Yes (`soriku-engine-client`) |
