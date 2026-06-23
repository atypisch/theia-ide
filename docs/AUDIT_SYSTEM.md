# Soriku IDE + Engine — System Audit

Date: 2026-06-22. Scope: the de-forked Soriku IDE (`~/Sites/soriku-ide`, branch
`defork/option-c`) and the engine it drives (`~/Sites/soriku`, branch
`multi-agent/fase-a`). This audit reflects the state after the chat /
tool-delegation / orchestration / Manage-Models / Conversations work.

## 1. Architecture & de-fork status

- **No forked Theia core** — all `@theia/*` come from npm; Soriku ships as peer
  `@soriku/*` extensions under `theia-extensions/soriku-*`. The only patch is
  `@theia+terminal` (asar path fix), documented in `docs/DEFORK_1_KNOWN_PATCHES.md`.
- **Extensions** (all build, lint, test clean): `soriku-engine-client` (HTTP/SSE
  client + shared event buses), `soriku-workbench` (engine status bar, first-run,
  prefs/keybindings), `soriku-auth` (Simezu/local), `soriku-agents` (agents panel
  + selection), `soriku-chat` (streaming chat, modes, plan approval, history
  resume), `soriku-tools-bridge` (client-side tool execution), `soriku-models`
  (Manage Models), `soriku-conversations` (history panel), `soriku-capability-map`,
  `soriku-routing-overrides`, `soriku-agent-customization`.
- **Engine**: FastAPI `server.py` + `core/*` (agent loop/WorkerLoop, conductor +
  plan runtime, smart router, providers, agents/learning, conversation store,
  feedback). Runs on `127.0.0.1:8765` via launchd.

## 2. What works (verified this session)

| Capability | Status | Evidence |
|---|---|---|
| Engine connect + status bar + first-run | ✅ | live: "Soriku: 127.0.0.1:8765 / Local mode" |
| Agents panel (21 agents) + chat streaming + model transparency | ✅ | live: answers show responding model |
| Orchestration: Auto / Single / Plan (approve) / Ensemble (pick models) | ✅ | live: ensemble merged qwen2.5-coder + gemma3; Plan approve→run |
| Client-side tools run in the workspace | ✅ (read proven live) | `list_directory` returned the sumezi workspace, not the engine dir |
| Manage Models (providers/health, pull, install, browse, activate, delete) | ✅ | live; Anthropic shown unavailable with real reason |
| Provider availability (real key/credit health) | ✅ | `/api/providers` reports Anthropic "credit balance too low" |
| **Chat history + context** | ✅ | history panel; reload resumes; agent recalled "42" across reload |
| **Agent learning from feedback** | ✅ | `scripts/prove_agent_learning.py` → rule promoted + routing +0.067 |
| Tests | ✅ | IDE 138/138; engine 1574 passed / 2 skipped |

## 3. Security

- **API keys** in an OS keystore (`core/providers/keystore.py`), referenced by id;
  not stored in conversation/agent JSON. ✅
- **Provider health** correctly reports unusable keys: `claude.py` does a minimal
  completion and treats 400/402/403 (incl. "no credits") as unhealthy with the
  real message; `gemini.py` / `custom.py` probe `/models` and treat non-200 as
  unhealthy. ✅ (Note H4 below: gemini/custom won't catch quota/credit exhaustion
  that only surfaces on a completion — low risk.)
- **Tool execution**: destructive tools (`file_write`, `shell_exec`) are
  default-deny with an "Allow once" confirmation; the IDE only delegates
  `file_read`/`file_write`/`list_directory`. Hosted (Simezu) mode registers no
  local fs/shell tools (worker 409). ✅
- **CORS / origin**: the engine whitelists `http://localhost` only; the IDE must
  be reached via Apache at `http://localhost/soriku-ide/` (→ `:3000`), not
  `127.0.0.1:<port>`. Operational constraint, documented in `DEFORK_4_RESULT.md`.
- **Secrets in the launchd plist** (incl. a live key) — pre-existing; outside the
  IDE. Flagged for the engine repo.

## 4. Persistence

- **Conversations**: engine persists to `data/conversations/{id}.json` (+ SQLite),
  with adaptive context windowing (`_build_messages`) and now `persona_id` binding.
  The IDE resumes the active chat across reloads (StorageService) and lists/opens
  past chats. ✅
- **Agents / learning**: `data/agents/{id}/agent.json`. **Settings**:
  `data/settings.json` (conductor pinned to `ollama:qwen2.5-coder:7b`).
- **Feedback**: `data/feedback/*.jsonl`.

## 5. Learning (used vs stored-but-unused)

Used (proven): feedback → `domain_rules` in the system prompt; feedback →
routing-confidence adjustment (±0.1); golden examples → benchmarkable.
**Stored but not consumed**: `agent.memory.decision_patterns`,
`learning.quality_scores` (recorded every interaction, only shown in the agent
profile). See `docs/PROOF_AGENT_LEARNING.md`.

## 6. Findings & prioritised issue list

| # | Pri | Finding | Recommendation | Status |
|---|-----|---------|----------------|--------|
| C0 | — | No critical, broken, or insecure behaviour found in the IDE/engine paths exercised. | — | — |
| H1 | High | Small local models (qwen2.5-coder:7b, qwen3:8b) reliably print fenced code instead of calling `file_write`, so **agent file edits were unreliable**. | The worker loop now converts a fenced `# filename: <path>` block into a real (confirmed) `file_write`. | **FIXED** (engine `ea025fe`; verified: file on disk) |
| H2 | High | `decision_patterns` + `quality_scores` persisted but never surfaced/editable/consumed. | Agent edit view shows learned rules/quality/stack/stats; `decision_patterns` are editable (PATCH) **and now weigh in** — top keywords are injected as "Focus areas" prompt hints (compose + request-time). | **FIXED** (IDE `e77986d`+`P4.16`; engine `25c2512`+`98fd618`) |
| H3 | Med | Conversations created before persona binding have `persona_id: null`, so "resume with same agent" only works for new chats. | Acceptable; optionally backfill from the first message's agent. | accepted |
| H4 | Med | `gemini.py`/`custom.py` health probed `/models`, so a valid key with exhausted quota/credits read as healthy. | Both now do a 1-token completion probe and classify 400/402/403 as unhealthy with the real message (like `claude.py`). | **FIXED** (engine `a05b976`) |
| M1 | Med | `tests/perf/test_tracer_overhead.py` asserts <5% overhead and fails under concurrent machine load. | `pytest.ini` deselects `-m perf` by default; run perf in isolation with `pytest -m perf`. | **FIXED** (engine `f87a10f`) |
| M2 | Low | Missing `DEFORK_5_*` final-state/handoff docs from the original plan. | Author when the de-fork branch is finalised. | open |

## 7. How to run / verify (operational)

```bash
# engine: launchd on 127.0.0.1:8765 (kill to respawn). conductor pinned local.
cd ~/Sites/soriku-ide && yarn build:dev
yarn --cwd applications/browser start --port 3000
open http://localhost/soriku-ide/          # NOT 127.0.0.1:3000 (CORS)

yarn test                                   # IDE extension tests (lerna)
cd ~/Sites/soriku && .venv/bin/python -m pytest tests/ -q
.venv/bin/python scripts/prove_agent_learning.py
```

## 8. Conclusion

The de-forked stack is functionally sound and well-tested: connection, chat with
model transparency, four orchestration modes with plan approval, client-side
tools that operate on the real workspace, live model/provider management with
real availability, persisted chat history with context that survives reloads, and
a demonstrable agent-learning loop. No critical defects were found. The open
items are one model-capability limitation (H1, the headline for reliable agent
edits), two incomplete-feature/clean-up items (H2, H4), and test/doc hygiene
(M1, M2) — to be scheduled by priority.
