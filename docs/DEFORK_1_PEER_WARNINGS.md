# DEFORK 1 — Peer & Transitive Dependency Warnings

**Date:** 2026-06-08 · Branch `defork/option-c` · after stripping 24 `@theia/ai-*` direct deps.

## Headline finding — 2 `@theia/ai-*` packages survive transitively

After removing all 24 `@theia/ai-*` direct dependencies from the three apps, **2 still get wired
into the generated application**:

| Package | Why it's still here | Modules wired |
|---------|--------------------|----------------|
| `@theia/ai-mcp`  | **Non-optional** dependency of `@theia/plugin-ext` (core infra we must keep). `@theia/plugin-ext/lib/main/browser/lm-main.js` **imports it in code** to back Theia's `vscode.lm` plugin API. | `lib/browser/mcp-frontend-module`, `lib/node/mcp-backend-module` |
| `@theia/ai-core` | Pulled transitively by `@theia/ai-mcp`. | `lib/browser/ai-core-frontend-module`, `lib/node/ai-core-backend-module` |

**Mechanism:** Theia's `ExtensionPackageCollector`
(`@theia/application-package/lib/extension-package-collector.js`) recurses through the dependency
tree and wires *any* package exposing a `theiaExtensions` field — including transitive ones. Verified
with `ApplicationPackage.extensionPackages`: 52 extension packages wired for the browser app, 2 of
them AI (`ai-core`, `ai-mcp`).

**AI activation:** `@theia/ai-core` marks the feature active by default
(`ai-activation-service.js` → `createKey('ai-features.AiEnable.enableAI', true)`), so a residual
"AI Features" preferences section and the MCP view/commands would be visible by default.

### Decision (Marten, 2026-06-08): **Accept as plugin infrastructure, hide UI later. No patches.**

- These 2 packages are treated as upstream plugin infra (they power `vscode.lm`), not as the
  Soriku-competing AI layer. The 22 packages that *did* provide chat/agents/providers are gone.
- Fully removing them would require patching `@theia/plugin-ext` source (`lm-main.js`) — this
  violates non-negotiable rule #2 (no Theia infra patches beyond the `@theia+terminal` asar fix) and
  would break `vscode.lm` for installed VS Code extensions.
- **Follow-up (Phase 3.5):** suppress the residual `ai-core` / `ai-mcp` user-visible contributions
  (commands, menus, "AI Features" preferences, MCP view) from a `@soriku/*` frontend module using
  Theia's unbind/filter mechanisms — **no patch**. Tracked as a Phase 3.5 task.

DoD line "`@theia/ai-*` packages volledig verwijderd uit alle `package.json` bestanden" is satisfied:
no `@theia/ai-*` appears in any tracked `package.json`. The 2 survivors are transitive-only.

## Standard peer-dependency warnings (benign)

`yarn install` emits 20 unmet-peer-dependency warnings, all pre-existing upstream noise unrelated to
the strip (toolchain peers and React peers resolved at the app level):

- `@typescript-eslint/eslint-plugin-tslint` → `tslint`, `typescript` (dev toolchain)
- `eslint-plugin-deprecation`, `ts-node`, `tsutils` → `typescript` (dev toolchain)
- `theia-ide-product-ext` → `react@^16.8.0` (provided transitively by `@theia/core`)
- `react-perfect-scrollbar`, `react-textarea-autosize`, `use-*` → `react` / `react-dom` (provided by app)
- `opfs-worker` → `typescript@>=5.0.0`
- `@modelcontextprotocol/sdk` (via `@theia/ai-mcp`) → `zod` (provided transitively)
- `app-builder-lib`, `wdio-chromedriver-service` → electron-builder/chromedriver peers (electron-next only)
- `inversify` / `@inversifyjs/*` → `reflect-metadata` (provided by app)

None of these block install or build; they exist on upstream theia-ide as well. No action required.
