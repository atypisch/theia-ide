# OPT Phase 0.3 — Bug-inventory

**Date:** 2026-06-30 · Source: read-only runtime-correctness audit. This is the **Phase-1 backlog of record**; commit subjects reference `#N`.

Severity: **blocker** (breaks a core flow / hangs / data-corruption), **major** (frequent wrong behaviour or security), **minor** (edge/hygiene).

## Blockers

### #1 — Abandoned tool-approval never resolves → engine stream deadlock
- **Where:** `soriku-tools-bridge/src/browser/soriku-tool-approval-bridge.ts:36-49,61`
- **Repro:** start a turn that needs tool confirmation; close the chat panel / switch agent / let the turn error while the banner is open.
- **Expected:** engine gets an explicit denial, stream unblocks. **Actual:** the approval Promise only settles via `respond()` or supersession; `cancelPending()` exists but is **never called** (grep-confirmed); no timeout. The engine blocks its stream on `/api/worker/confirm` → server-side agent-loop hangs.
- Compounds with #2.

### #2 — Chat widget has no `dispose()`; stream survives panel close
- **Where:** `soriku-chat/src/browser/soriku-chat-widget.tsx` (no dispose override; `abortController` at :413 not in `toDispose`)
- **Repro:** open a streaming turn, close the chat panel mid-stream.
- **Expected:** stream aborts, tools stop, state stops mutating. **Actual:** the SSE `for await` loop keeps running — mutates `this.conversation`, calls `scheduleUpdate()` on a detached widget, executes delegated tools, writes files, and strands any pending approval (#1).

## Majors

### #3 — Single malformed SSE frame flips the whole turn to permanent error
- **Where:** `engine-client/src/common/engine-http.ts:130-136` (`safeParseSse` → `{type:'error'}`) + `soriku-chat/src/common/chat-model.ts:462-465,475-477`
- The transport converts a bad frame to a non-fatal `error` event to "keep going", but the reducer treats any `error` as terminal, and later `chunk`/`done` only advance status when still `streaming`. One keepalive-ish/malformed frame → successful turn stuck in permanent error.

### #4 — No idle/read timeout on SSE streams
- **Where:** `engine-http.ts:144-145` (`timeoutMs = stream ? undefined : ...`)
- A hung engine that sends no bytes and never closes blocks `reader.read()` forever; only user Stop or process exit escapes. No heartbeat watchdog.

### #5 — No mid-stream reconnect/resume
- **Where:** `engine-http.ts:97` → `soriku-chat-widget.tsx:453-455`
- A dropped connection throws `StreamInterruptedError` → turn error; partial answer lost, no retry, no `Last-Event-ID`. (True resume needs engine support — IDE half is bounded retry with partial preservation.)

### #6 — SSE generator never cancels the body on early exit
- **Where:** `engine-http.ts:121-123` (`finally` only `reader.releaseLock()`)
- No `reader.cancel()`; if the consumer stops iterating (widget torn down, #2), the HTTP body/connection is not cancelled/drained → leaked connection.

### #7 — Cross-worker tool misattribution
- **Where:** `chat-model.ts:143-150,174-205,451-459` (`lastUnfinished`, `findToolCallIndex` backward-scan by name)
- `toolCalls[]` carries no `worker_id`. With interleaved parallel workers and absent `call_id`, worker B's `file_write` result binds to worker A's pending entry; outcomes land on the wrong card. (IDE analog of the web-frontend `lastIndexOf` bug.)

### #8 — Duplicate/mis-merged cards between `tool_request` and `worker_tool_call`
- **Where:** `chat-model.ts:345-347,447-450`
- Merge relies on a shared `call_id`; if the `tool_request` request_id differs from the `worker_tool_call` id (or both absent), you get a duplicate row or a wrong `lastUnfinished` merge.

### #9 — Two connection-status sources of truth, no polling
- **Where:** `soriku-workbench/.../soriku-engine-status-service.ts`, `soriku-engine-status-contribution.ts:60-67,99`; also `soriku-auth/.../soriku-auth-service.ts:49`
- Status pings once at startup, re-pings only on manual reconnect → status bar reads "connected" long after the engine died; chat widget ignores status entirely.

### #10 — Parallel confirmations: all but the last silently auto-denied
- **Where:** `soriku-tool-approval-bridge.ts:41-44`
- `prompt()` supersedes a pending confirmation by resolving it `{approved:false}`. With multiple workers, only the newest banner shows; earlier ones auto-deny unseen.

### #11 — SECURITY: no path containment (workspace escape)
- **Where:** `soriku-tool-confirmation-service.ts:220-231` (`resolveUri`); also `soriku-editor-reveal-service.ts:57-68`
- `root.withPath(path)` for absolute, `root.resolve(path)` for relative, no containment check. `path='/etc/passwd'` reads/writes outside the workspace; `'../../..'` escapes. Applies to file_read/file_write/apply_patch/shell_exec.

### #12 — SECURITY: `shell_exec` "allow always" auto-runs all future commands
- **Where:** `soriku-tool-confirmation-service.ts:27,119-138,206-215`
- `SESSION_ALLOW.add(request.tool)` keys by tool name → once `shell_exec` is remembered, every subsequent arbitrary command runs unreviewed via `child_process` with `cwd`=workspace.

### #13 — No startup/backoff reconnect; engine-up-after-down undetected
- **Where:** `soriku-engine-status-contribution.ts:63-67`
- `autoConnect` runs once; no polling/backoff. Once the engine later comes up, the IDE won't notice until a manual reconnect or next user action.

### #14 — Auth 401 mid-stream → plain turn error, no re-auth
- **Where:** `engine-http.ts:183-199`; `soriku-auth-service.ts:80-84`
- A 401 during a stream throws → turn error; nothing triggers refresh or a re-auth prompt. No token auto-refresh path (static token holder).

## Minors

- **#15** — `followExternalPlan` wholesale-replaces `this.conversation` → can wipe an unsaved local chat. (`soriku-chat-widget.tsx:1061`)
- **#16** — Agent switch/abort doesn't clear `toolApproval.pending`/`resolvingPlans` → stale approval resolves into new context. (`soriku-chat-widget.tsx:365-381`)
- **#17** — `scheduleUpdate` rAF can fire `update()` on a detached widget. (`soriku-chat-widget.tsx:201-204`)
- **#18** — `refreshRetryTimer` never cleared / not in `toDispose`. (`soriku-conversations-widget.tsx:74`)
- **#19** — PlanLiveBridge reconnect loop: no backoff/cap; singleton dispose never called. (`soriku-plan-live-bridge.ts:49-55`)
- **#20** — Inline-completion provider Disposable discarded; double `onStart` would double-register. (`soriku-inline-completion.ts:36`)

## Fix sequencing (Phase 1)

Security jumps the queue (isolated, highest severity-per-LOC, makes manual testing safe):
**C1** #11,#12 → **C2** #1,#10,#16 → **C3** #2,#17 → **C4** #6,#4,#3,#5 → **C5** #7,#8 → **C6** #9,#13 → **C7** #14 → **C8** #15,#18,#19,#20. Each: fix + extended spec + green `lerna run test`.
