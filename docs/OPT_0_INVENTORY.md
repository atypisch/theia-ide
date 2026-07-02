# OPT Phase 0.1 — Repo-inventory

**Date:** 2026-06-30 · **Branch:** `opt/phase-0-docs` (tagged base: `pre-optimalisatie-baseline`)
**Scope:** read-only inventory for the optimization effort. Supersedes the 2026-06-08 `PHASE_0_INVENTORY.md` (which predates all soriku extensions).

## Package inventory

15 extensions under `theia-extensions/`. Naming is `soriku-*-ext` (11) plus 4 upstream Theia-IDE forks (`theia-ide-*-ext`). Note: the master prompt's `@soriku/*` scope does not exist — actual package names are unscoped `soriku-<domain>-ext`.

| Dir | Package | src LOC | Files | Responsibility | Depends on (soriku) |
|-----|---------|--------:|------:|----------------|---------------------|
| soriku-engine-client | `soriku-engine-client-ext` | 1879 | 13 | **HUB**: EngineClient contract + HTTP/SSE impl, engine types, inline completion, plan-live bridge, auth-token holder, preferences | none (pure hub) |
| soriku-chat | `soriku-chat-ext` | 2421 | 8 | Chat widget (SSE streaming, model transparency), chat-model reducer, markdown | agents, engine-client, tools-bridge |
| soriku-tools-bridge | `soriku-tools-bridge-ext` | 1123 | 11 | Tool confirmation/approval, diff-review, editor-reveal, tool delegation | engine-client |
| soriku-models | `soriku-models-ext` | 625 | 5 | Models view, Ollama/remote model management | engine-client |
| soriku-workbench | `soriku-workbench-ext` | 561 | 9 | Engine status bar/service, agent-pick, workbench prefs | agents, engine-client |
| soriku-agent-customization | `soriku-agent-customization-ext` | 533 | 5 | Agent edit widget + form | engine-client |
| soriku-mcp | `soriku-mcp-ext` | 480 | 5 | MCP servers view/management | engine-client |
| soriku-auth | `soriku-auth-ext` | 445 | 5 | Auth service + status contribution | engine-client |
| soriku-agents | `soriku-agents-ext` | 395 | 6 | Agents view + selection | engine-client |
| soriku-capability-map | `soriku-capability-map-ext` | 375 | 5 | Capability map widget | engine-client |
| soriku-conversations | `soriku-conversations-ext` | 367 | 5 | Conversations history view | engine-client |
| soriku-routing-overrides | `soriku-routing-overrides-ext` | 325 | 5 | Routing-overrides widget | engine-client |
| updater | `theia-ide-updater-ext` | 628 | 6 | (fork) Electron auto-updater | none |
| product | `theia-ide-product-ext` | 617 | 8 | (fork) Branding, about, getting-started | none |
| launcher | `theia-ide-launcher-ext` | 496 | 8 | (fork) Desktop-file/AppImage launcher | none |

Totals: soriku src ≈ **8,529 LOC**; all src ≈ 11,270 LOC. Biggest files (Phase-4 decomposition candidates): `soriku-chat/src/browser/soriku-chat-widget.tsx` (**1163**), `soriku-chat/src/common/chat-model.ts` (**658**), `soriku-engine-client/src/common/engine-types.ts` (530), `soriku-models/src/browser/soriku-models-widget.tsx` (436).

## Build & runtime

- **Theia** `1.73.0-next.2` (prerelease) everywhere; monaco-editor-core `1.108.201`.
- **Node** ≥22 · **Yarn 1** classic workspaces (`applications/*`, `theia-extensions/*`) + **Lerna** ^9.
- **Apps:** `applications/browser` (current usage; MAMP proxy `localhost/soriku-ide` → Theia backend `:3000`), `applications/electron`, `applications/electron-next` (desktop = later fase).
- **Bundler:** esbuild (`esbuild.mjs`, `gen-esbuild.*.mjs`) — **no metafile/analyzer configured**.
- **Build:** root `yarn build` = lerna `build:extensions` (per-ext `tsc`) → `theia build --app-target=browser|electron`. **Start:** browser `theia start --plugins=local-dir:../../plugins`.
- **Perf/bundle tooling: none.** But `@theia/metrics` is already a dependency of the browser app → Prometheus `/metrics` endpoint on the backend (zero-code memory probe).

## Dependency graph (verified via package.json + import scan)

```
soriku-engine-client  ←  all 10 other soriku exts   (44 import sites)
soriku-tools-bridge   ←  soriku-chat                 (4)
soriku-agents         ←  soriku-chat, soriku-workbench (3)
```

`engine-client` imports **zero** soriku extensions. **No circular dependencies — the graph is a DAG** rooted at the hub.

## Tests

- Framework: Node built-in test runner (`node --test lib/test/**/*.spec.js` after build), `assert`. No jest/mocha.
- All **12 soriku extensions have tests** (16 spec files, ~243 `describe/it` sites). Forks have none.
- Largest suites: `soriku-chat/src/test/chat-model.spec.ts` (366 LOC), `soriku-engine-client/src/test/engine-http.spec.ts` (282 LOC).
- Root: `lerna run test`.

## Existing docs

24 files in `docs/`: fork-audit series (`AUDIT_*`), defork series (`DEFORK_*`), phase docs (`PHASE_0..2`), planning (`FASE_D_PROPOSAL.md`, `FOUNDATION_PLAN.md`, `BASELINE_SUMEZI_2026-06-25.md`, `CURSOR_PARITY.md`), `developing-with-local-theia.md`, `design/`. `FOUNDATION_PLAN.md` §5 already names perf targets (completion <300ms, first-token <2s, p50/p95 regression guard) — **not yet instrumented**.

## Perf instrumentation status

**None.** No `performance.now`, `console.time`, `process.hrtime`, or metrics emission in any `theia-extensions/*/src`. Only a declared (unused) `soriku.telemetry.enabled` preference. Baseline methodology therefore relies on browser-side observation + the existing `/metrics` endpoint — see `OPT_0_PERF_BASELINE.md`.
