# Soriku IDE — Cursor parity checklist (P1 sprint)

Status after Opus-benchmark IDE sprint. Legend: ✅ done · 🟡 partial · ⬜ planned (P2+).

## P1 — Tools + context

| Item | Status | Notes |
|------|--------|-------|
| `apply_patch` delegation | ✅ | Unified-diff apply via tools-bridge |
| `project_search` delegation | ✅ | Workspace walk + grep |
| `shell_exec` delegation | ✅ | cwd = workspace root, 30s timeout |
| Editor / workspace context in chat | ✅ | `ChatStreamParams.context` → engine |
| `@file` mentions in prompt | ✅ | Parsed as `context: file` items |
| Allow always (session) for destructive tools | ✅ | Session-scoped `SESSION_ALLOW` set |
| **Inline tool approval (no modal)** | ✅ | Banner above chat input; auto-approve read-only tools |
| `generated_files` in plan SSE → chat UI | ✅ | `worker_done` + `generated_files` events |
| Plan worker progress in chat | ✅ | Phase labels per worker / tool |
| **Live editor reveal on file write** | ✅ | `SorikuEditorRevealService` — auto-opens changed files |
| **Rich file-write cards in chat** | ✅ | Path + code preview instead of raw JSON |

## P2 — Chat UX

| Item | Status |
|------|--------|
| Markdown + syntax highlighting in messages | ✅ |
| Editable plan tasks before execute | ✅ |
| Verify mode in behaviour picker | ⬜ |
| Routing transparency panel | 🟡 (model label on turn) |
| SSE rAF-batched re-renders + TTFT in meta | ✅ |
| Live `worker_chunk` text during plan runs | ✅ |

## P3 — Inline edit (Cmd+K)

| Item | Status |
|------|--------|
| `soriku-inline-edit` extension | ⬜ |
| Selection → prompt → diff → apply | ⬜ |

## P4 — Intelligence

| Item | Status |
|------|--------|
| Benchmark trigger in capability map | ⬜ |
| Multi-model ensemble UI | 🟡 |
| Per-project routing overrides | 🟡 |
| Local-first cost transparency | 🟡 |
| Model warm-up on chat connect | ✅ | `warmModel()` when Single model is picked |

## Engine parity (soriku repo)

| Item | Status |
|------|--------|
| `conductor.model_hint: null` | ✅ |
| HTML/JS/Python completion gate priority | ✅ |
| `file_guide` in plan workers | ✅ |
| `model_assist` for code workers | ✅ |
| `generated_files` on `worker_done` | ✅ |
| Benchmark `tool_use` HTML cases | ✅ |
| Track settings A/B/C + restart script | ✅ |
| Plan task edits on execute | ✅ |
