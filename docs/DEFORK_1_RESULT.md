# DEFORK 1 — Result

**Date:** 2026-06-08 · Branch `defork/option-c`

## What was done

1. **1.1 SKIP** — no forked Theia core to revert (confirmed by audit).
2. **1.2** Removed all **24** `@theia/ai-*` direct dependencies from
   `applications/{browser,electron,electron-next}/package.json`.
   (Audit said "23"; the real list is 24, incl. `@theia/ai-vercel-ai`.)
3. **1.3** Decoupled `theia-extensions/product` from `@theia/ai-registry`:
   - dropped the `@theia/ai-registry` dependency,
   - removed the `AIRegistryConfiguration` import + rebind block from `theia-ide-frontend-module.ts`,
   - deleted `theia-ide-ai-registry-configuration.ts`.
4. **1.4** Clean `yarn install` (6.9s). Peer + transitive warnings documented in
   `DEFORK_1_PEER_WARNINGS.md`.
5. **1.5** `@theia+terminal` asar patch still applies (cosmetic version-name warning only);
   documented with the inherited `@lumino/widgets` upstream patch in `DEFORK_1_KNOWN_PATCHES.md`.
6. **1.6** Built extensions (`yarn build:extensions`, 0 errors) and the browser app
   (`theia build --app-target=browser --mode development`, **0 errors**, browser + node bundles).

## Packages removed (24, from all three apps)

```
ai-anthropic  ai-chat        ai-chat-ui    ai-claude-code  ai-code-completion
ai-codex      ai-copilot     ai-core-ui    ai-editor       ai-google
ai-history    ai-huggingface ai-ide        ai-llamafile    ai-mcp-server
ai-mcp-ui     ai-ollama      ai-openai     ai-registry     ai-scanoss
ai-terminal   ai-vercel-ai   ai-core*      ai-mcp*
```
\* `ai-core` and `ai-mcp` were removed as **direct** deps but **return transitively** (see below).

## Residual transitive AI packages (accepted — Marten 2026-06-08)

Generated frontend module (`applications/browser/src-gen/frontend/index.js`) wires exactly **2**
`@theia/ai-*` modules, both transitive via `@theia/plugin-ext → @theia/ai-mcp → @theia/ai-core`
(plugin-ext imports ai-mcp in code to back the `vscode.lm` plugin API):

- `@theia/ai-core` → `ai-core-frontend-module`
- `@theia/ai-mcp` → `mcp-frontend-module`

All 22 chat/agents/provider packages are **absent** from the generated module (verified: `ai-chat`,
`ai-chat-ui`, `ai-ide`, `ai-anthropic`, `ai-openai`, `ai-ollama`, `ai-google`, `ai-history`,
`ai-code-completion`, `ai-registry` all → 0 references). `soriku-engine-client-ext` **is** wired
(`soriku-engine-frontend-module`). See `DEFORK_1_PEER_WARNINGS.md` for the full rationale and the
Phase 3.5 follow-up to hide the residual `ai-core`/`ai-mcp` UI without patching.

## Boot confirmation

- Extensions: 4 projects build, 0 errors.
- Browser app: `[build/browser] 0 errors`, `[build/node] 0 errors`.
- Generated module verified to exclude the removed AI stack and include the engine client.
- **Interactive boot** (file tree / editor / terminal, no chat/agents panels) is verified manually by
  Marten at STOP-CHECKPOINT 1 via:
  `yarn --cwd applications/browser start` → open `http://localhost:3000`.

## Outstanding for later phases

- Phase 2: build `@soriku/*` AI layer.
- Phase 3.5: suppress residual `ai-core`/`ai-mcp` user-visible contributions via a Soriku frontend
  module (no patch).
