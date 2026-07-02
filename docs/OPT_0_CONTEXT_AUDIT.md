# OPT Phase 0.5 — Context-kwaliteit audit (IDE → engine)

**Date:** 2026-06-30 · Source: read-only audit of what the IDE sends to the engine per chat/pilot call. This determines engine output quality — the IDE cannot make the engine smarter, but it can (and today does) starve/corrupt the engine's context. **Phase-2 backlog of record.**

**Endpoint:** the IDE calls `POST /api/worker` (`engine-client-impl.ts:144`, `transport.postSse`). `/api/pilot` is a deprecated alias. Both accept the same `ChatRequest` (server.py:700).

## What is actually sent

Body built at `engine-client-impl.ts:124-142` from params at `soriku-chat-widget.tsx:465-504`: `prompt`, `persona_id`, `conversation_id`, `project_id`, `mode`, `model_id`, `worker_count`, `worker_models`, `tools_enabled`, `stream`, `client_tools` (fixed `DELEGATED_TOOLS` list, only when edits enabled), `context`, `plan_auto_execute`, `routing_strategy`, `cloud_cost_cap_eur`.

## Gap table

| Context type | Sent today? | Where | Gap / risk | Owner |
|---|---|---|---|---|
| Prompt text | ✅ | widget:489 | none | — |
| Workspace root | ⚠️ as `Workspace root:` + `project_id` | widget:522,290 | **format mismatch** (below) | IDE+ENGINE |
| Active file path | ❌ | — | engine blind to what user views | **IDE** |
| Active file content | ❌ | — | model must `file_read` blindly/guess | **IDE** |
| Selection / cursor (chat) | ❌ | — | "explain/fix this" has no referent | **IDE** |
| Cursor prefix/suffix (completion) | ✅ | inline-completion:48-69 | char-sliced 2000/1000; **not shared with chat** | IDE |
| Open editor tabs | ❌ (comment claims ✅) | widget:516 | misleading comment; never collected | **IDE** |
| @-mentioned files | ✅ path only | widget:524-534 | hardcoded ext allowlist | IDE |
| Project structure | ❌ | — | engine falls back to its OWN repo layout (server.py:3168-3177) | ENGINE |
| Conversation history | ❌ (relies on conv_id) | server.py:3405-3416 | 20-msg window; tool-results + plan-state dropped | **ENGINE** |
| Tool results → engine | ✅ | tool-confirmation-service:111-116 | double-truncated + reimplemented formatting drift | IDE |
| Images / multimodal | ❌ | ChatRequest.images (server.py:702) | unused capacity | IDE (later) |
| model_hint / disabled_tools | ❌ | server.py:703,736 | unused capacity | IDE (later) |

## Findings (Phase-2 items)

### C-A — Chat is blind to the editor  *(IDE-side)*
No active file, selection, cursor, or open tabs are ever sent (only `@`-mentions + a workspace line). The `widget:516` comment claiming tabs are sent is false. Inline completion is the *only* feature sending real cursor context, via a separate `/api/complete` path — not shared with chat. The engine already accepts rich `context` items (text/file, read server-side at server.py:5240) plus `images`/`model_hint`/`disabled_tools` — all unused.
→ **Fix A:** `EditorContextCollector` (Theia `EditorManager`/`ApplicationShell`) → `ChatRequest.context` items, capped, preference-gated.

### C-B — Workspace format mismatch (highest leverage)  *(split IDE/ENGINE)*
The IDE emits `Workspace root: /path`, but every engine extractor greps `Workspace:` — `agent_loop.py:1113`, `workspace_learnings.py:63`, `file_write_guard.py:39`. So per-project **learnings, soriku.md guidelines, and the write-guard root silently resolve to None** for IDE chats (fallback is a hardcoded `/Sites/sumezi` path). Worse, the workspace text lands in the **system prompt** while guard extractors read the **user prompt** (`agent_loop.py:307-309` `set_guard_context(prompt)`) — so it never reaches them at all. The engine then substitutes its own repo's file structure as "project context" (server.py:3168-3177).
→ **B-IDE** (trivial, biggest silent win): emit exactly `Workspace: /path` in the user-prompt-visible context. → **B-ENGINE** (escalate): thread structured context into `set_guard_context`/extractors, drop the own-repo fallback.

### C-C — Cross-turn context loss  *(ENGINE-side)*
History is reconstructed server-side from stored `user`/`assistant` text only, windowed to the last 20 messages (server.py:3405-3416). Tool results, tool-call steps, agent/fleet context, and plan state from prior turns are dropped. → escalate; no IDE stopgap (resending summaries would be engine logic in the IDE).

### C-D — Tool-result fidelity  *(IDE-side)*
`file_read` truncated to 200 lines client-side (tool-delegation.ts:70) then 8000 chars engine-side (double truncation). The IDE reimplements engine tool formatting (`formatDirectoryListing`, `applyUnifiedPatch`, `formatSearchResults`) — drift risk. `applyUnifiedPatch` (tool-delegation.ts:93-123) is a minimal hand-rolled patcher (no fuzz/context validation) → silent mis-patches. → **Fix D:** let the engine own truncation (single source of truth); replace the patcher with the `diff` package + strict-match failure.

### C-E — Completion/chat context split  *(IDE-side)*
Inline completion gathers real cursor context but independently of chat. → **Fix E:** share the Fix-A collector.

## Engine work order (→ `docs/OPT_5_ENGINE_GAPS.md`, sign-off at Checkpoint 2)
B-ENGINE (guard-context plumbing + drop own-repo fallback), C (history enrichment), plus the Phase-1 engine guarantees (worker_id/call_id on all tool events for #7/#8; resume token for #5) and optional D-ENGINE (anchored edits, remove client patching).
