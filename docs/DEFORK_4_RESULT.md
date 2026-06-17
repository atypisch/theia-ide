# DEFORK Phase 4 — Engine connection end-to-end (result)

Branch: `defork/option-c`. Engine: `~/Sites/soriku` @ `multi-agent/fase-a`.

## What shipped

| Step | Commit | State |
|------|--------|-------|
| P4.1/4.2 — startup ping → status bar + quick-pick (Reconnect / Switch URL / Settings) | `0e112ae` | done |
| P4.3 — first-run prompt (local / hosted-Simezu / skip), persisted once | `7f06d04` | done |
| P4.3 fix — await `preferences.ready` before reading the first-run flag | `d69b8c6` | done |
| P4.5 — client-side tool execution (file tools run in the IDE workspace) | `15f444b` (IDE) + `841f6b0` (engine) | done |

All `@soriku/*` unit tests pass 3× clean (94 tests). Engine `test_agent_loop.py`
+ `test_worker.py` pass (incl. 3 new delegation tests). Model-name grep = 0.

## How to run (important: origin matters)

The browser app must be reached through Apache at **`http://localhost/soriku-ide/`**,
which proxies to the Theia server on `127.0.0.1:3000` (see repo-root `.htaccess`).
The engine whitelists CORS for origin `http://localhost` only — reaching the app
directly at `http://127.0.0.1:<port>` makes every engine call CORS-fail
("Engine unreachable" despite the engine being up).

```bash
# engine: launchd-managed on 127.0.0.1:8765 (kill to respawn with new code)
yarn build:dev                                   # build extensions + browser app
yarn --cwd applications/browser start --port 3000
open http://localhost/soriku-ide/                # NOT 127.0.0.1:3000
```

## Verified end-to-end (Playwright)

- Auto-connect → status bar "Soriku: 127.0.0.1:8765" + "Local mode".
- First-run prompt shows once; after a choice it does not reappear.
- Agents panel populated from the engine (21 agents, local mode).
- Chat streams an answer with the responding model shown (`qwen2.5-coder:7b`).
- Multi-turn in one session; inline tool-call display; thumbs feedback.
- `list_directory` runs in the IDE and returns the **workspace** files (sumezi),
  not the engine's own directory — confirming client-side delegation.

## Open items

- **file_write delegation**: code + confirm dialog are in place and unit-tested,
  but small local models call write-tools unreliably, so it was not exercised by
  a live model. Same code path as the verified `list_directory`.
- **shell_exec / project_search / generate_document**: still run server-side.
  Delegate next if workspace-scoped shell/search is wanted.
- **Hosted mode**: filesystem tools are not registered on the engine in Simezu
  mode, so delegation needs the engine to expose tool schemas without local
  execution.
