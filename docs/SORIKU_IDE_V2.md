# Soriku IDE v2 — what is in, how to run and test it, what is still open

Design source: `design/Soriku IDE development/Soriku IDE v2.dc.html` (gitignored). Plan: `~/.claude/plans/we-hebben-in-design-cozy-snowflake.md`.

## Run it

```bash
yarn build:extensions && yarn --cwd applications/browser build      # ~15 s
cd applications/browser && yarn start <workspace-folder> --port=3111 --hostname=127.0.0.1
```

The engine (`~/Sites/soriku`, launchd, `:8765`) is picked up automatically. The first start asks how to connect.

## What changed

| Area | Where | Notes |
|---|---|---|
| Chat dock (header, bubbles, edit + revert/continue, plan card, run timeline, summary with Undo all / Keep, Mode + Model popovers) | `soriku-chat` | Dock ⇄ tab via button or by dragging the header |
| Run checkpoints (Undo all) | `soriku-tools-bridge` | `.soriku/checkpoints/`, restore is workspace-contained |
| Plan tab | `soriku-chat` | Opened by "Open plan ↗" / "Review full plan" |
| Agents panel | `soriku-agents` | Titlebar button; sits right of the editor (the right dock holds one widget) |
| Status bar: workers · minions, ✓ verified, soriku.md state | `soriku-workbench` | Real data only, hidden when empty |
| Engine log | Output panel → "Soriku Engine" | `/api/events` |
| `soriku.md` project instructions | `soriku-tools-bridge` | See below |
| `soriku-guard` | `soriku-tools-bridge` | See below |

## soriku.md

A default `soriku.md` is created when a folder has none of `soriku.md`, `AGENTS.md`, `CLAUDE.md` (setting `soriku.project.createDefaultInstructions`). The commands are filled in from the detected stack.
It is sent with every request as a context item of type `instructions`.

**Trust on first use:** a new or changed file is not sent until you approve it (banner in the chat, `⚠ soriku.md` in the status bar). The last approved text keeps being used meanwhile.
Suspicious wording (ignore-previous, sending secrets, `curl … | sh`, …) is listed in the banner.

## soriku-guard

One policy (`tools-bridge/src/common/guard-policy.ts`), two entrances:

1. **Mandatory:** every delegated tool call is evaluated before it runs. `deny` is final (no "Always allow", no preference, not soriku.md); `confirm` asks every time, even with auto-approve "all".
2. **MCP server** `soriku-guard` (stdio, no dependencies) for agents and the engine. Install it into the engine with the command **Soriku: Install Security Guard MCP Server**.

| Verdict | Examples |
|---|---|
| deny | path outside the workspace (incl. symlinks), writes to `.git/`, `.github/workflows/`, `.vscode/tasks.json`, `.env*`/keys; secrets or IOCs in written content; `bash -c`, `python -c`, `node -e`, `git push`, `npm publish`, `sudo`, network tools, env dumps; file tools without a path |
| confirm | reading `.env`/keys (output is redacted), `package.json`, lockfiles, `.vscode/`, `.claude/`, `soriku.md`/`AGENTS.md`/`CLAUDE.md`, dependency installs, `git commit`/`reset --hard`, recursive delete |

Tool output is redacted for secrets before it goes back to the model. Stops are logged to `.soriku/guard.log` (rule id + target, never values; git-ignored via `.soriku/.gitignore`).

## Test it

```bash
yarn --cwd theia-extensions/<ext> test                       # unit tests per extension (671 in total)
node scripts/mock-engine.mjs --port 8799 --script guard      # scripted engine: IDE guard/approvals without a model
```

For the mock engine start a second IDE with its own config so your real settings stay untouched:
`THEIA_CONFIG_DIR=<dir with settings.json {"soriku.engine.baseUrl":"http://127.0.0.1:8799"}> yarn start <ws> --port=3112`, send any Agent message, then read `GET http://127.0.0.1:8799/__log` and `<ws>/.soriku/guard.log`.

Engine side (`~/Sites/soriku`): `python -m benchmarks.agentic --scenario <id> --model auto --via http` talks to the running engine like the IDE does.
`php_taskboard_real` scores a real PHP + Vue project against an independent acceptance script in `~/Sites/soriku-testbed`.

## Open

- Engine: `apply_patch` is not registered for the model (E2), the engine-side guard hook (E4/E9) and the plan-note endpoint (E8) are not done.
- Pausing a plan is not immediate (workers finish their current step).
- "Continue from here" stops the run and sends an amend turn (the engine cannot rewrite a running plan).
- The right dock holds one widget, so the Agents panel cannot sit next to the chat as in the mock-up.
- Local model quality: on a machine with little free memory the engine falls back to 3–4B models; agent output is then limited by the model, not the IDE.
