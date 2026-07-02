# OPT Phase 0.2 — Performance baseline

**Date:** 2026-06-30 · **Rule:** measured, not "feels" — every Phase-3 claim is re-measured against these tables with the *exact same commands*. Zero code changes in Phase 0 (browser-side observation + the existing `@theia/metrics` endpoint).

## ⛔ Measurement status: BLOCKED — host not idle (2026-06-30)

Pre-flight failed: a **launchd-scheduled "deepseek full benchmark"** (PID 8631, parent = launchd, running ~4h) holds Ollama (`deepseek-r1:7b` loaded) and saturates the 16 GB host. Per the protocol and risk #2, perf measurement **and** the fresh prod build are deferred until this job finishes — measuring/building now would produce invalid numbers and thrash the host alongside a legit job (which is Marten's, not to be killed). Environment snapshot captured below for the record; measurement tables to be filled in the next idle window.

## Environment fingerprint (record before every session)

| Field | Value |
|-------|-------|
| Date/time | 2026-06-30 (pre-flight; measurement deferred) |
| git SHA (IDE) | `bd80407` |
| Build mode | prod (`theia build --app-target=browser`, no `--mode development`) — **not yet rebuilt** |
| macOS / Node | 15.7.3 / v24.11.1 (yarn 1.22.22) |
| `sysctl hw.memsize` | 16 GB |
| `uptime` load (1/5/15) | 4.82 / 3.35 / 3.45 (contended — launchd benchmark) |
| Ollama idle? (`curl -s localhost:11434/api/ps`) | **NO** — `deepseek-r1:7b` loaded |
| Engine benchmark running? | **YES** — launchd "deepseek full benchmark", PID 8631, ~4h in |
| Test workspace | fixed, same every run: _(pick, e.g. `/Users/martentiman/Sites/simezu`)_ |

**Reference only (current build, mode unknown — NOT the baseline; rebuild required):** `bundle.js` 32,366,325 B · `secondary-window.js` 25,806,095 B · `plugin-worker.js` 7,141,918 B · `editor.worker.js` 3,164,861 B.

**Session teardown (RAM discipline):** `browser_close` the MCP browser, kill the Theia backend, confirm with `ps`. Never leave `yarn watch` running during measurement.

## Build baseline (also a Phase-3 metric)

- Command: `cd /Users/martentiman/Sites/soriku-ide && /usr/bin/time -l yarn build`
- Wall-clock: _(fill)_ · Peak RSS: _(fill)_

## Metric 1 — Cold start (process start → interactive UI)

- **Backend-ready:** launch `yarn browser start` with timestamped log capture; ready = "listening on http" line − launch time.
- **Frontend:** MCP playwright → `browser_navigate http://localhost:3000` → `browser_wait_for` shell (`.theia-ApplicationShell`) → `browser_evaluate` dump of `performance.getEntriesByType('navigation')[0]` (domContentLoaded, loadEventEnd), `'paint'` (FCP), and all `'mark'|'measure'` (Theia's own startup marks). Protocol: 1 cold + 4 warm reloads.

| Measure | Cold | Warm p50 | Warm min–max |
|---------|-----:|---------:|-------------:|
| Backend-ready (s) | _(fill)_ | — | — |
| navigationStart → shell-visible (s) | | | |
| loadEventEnd (s) | | | |
| FCP (s) | | | |

## Metric 2 — Time-to-first-agent-list

- `browser_network_requests` → the agents GET; record `responseEnd − navigationStart`. Cross-check via `performance.getEntriesByType('resource')`.

| Measure | p50 | min–max |
|---------|----:|--------:|
| agent-list ready (s) | _(fill)_ | |

## Metric 3 — Time-to-first-token (5 runs)

- Fixed prompt: `"Say OK and nothing else"`.
- **Network TTFT:** resource-timing on `POST /api/worker` → `responseStart − fetchStart` (SSE first byte).
- **Perceived TTFT:** `browser_evaluate` installs a one-shot MutationObserver on the chat container; `performance.now()` at first token render − at click-send. (Page context, not repo code.)
- **IDE pipeline overhead = perceived − network** (model-independent — the headline, since absolute TTFT depends on the backing model which is context-only).

| Measure | p50 | spread |
|---------|----:|-------:|
| Network TTFT (s) | _(fill)_ | |
| Perceived TTFT (s) | | |
| **Pipeline overhead (s)** | | |

Backing model at measure time (context only): _(fill)_

## Metric 4 — Memory

- **Backend RSS:** `curl -s localhost:3000/metrics | grep process_resident_memory_bytes` (verify endpoint first run; fallback `ps -o rss= -p <backend-pid>`). Median of 3 samples @10s.
- **Frontend JS heap:** `browser_evaluate performance.memory.usedJSHeapSize`. Plus one manual Chrome Task Manager renderer read (labeled manual).
- Scenarios, each after 60s settle: (a) idle · (b) after 1 chat turn · (c) after 1 worker run ≥3 tool calls · (d) back-to-idle 2 min after (c).
- **(d) − (a) is the leak indicator** Phase-1 fixes #2/#6/#18/#20 must shrink.

| Scenario | Backend RSS (MB) | JS heap (MB) |
|----------|-----------------:|-------------:|
| (a) idle | _(fill)_ | |
| (b) 1 chat | | |
| (c) worker-run | | |
| (d) idle+2min | | |
| **(d)−(a) leak** | | |

## Metric 5 — Bundle sizes (stat-based; read-only)

- `ls -la applications/browser/lib/frontend/*.js *.css`; transfer size via `gzip -c bundle.js | wc -c`.
- `du -sk applications/browser/lib/{backend,frontend} theia-extensions/*/lib` for per-extension footprint.
- esbuild **metafile** (per-module attribution) = build-config change → **deferred to Phase-3 commit 1**. Phase-0 records totals only.

| Artifact | Raw | Gzip |
|----------|----:|-----:|
| frontend bundle.js | _(fill; current ~32.4 MB, mode unknown → rebuild)_ | |
| frontend css | | |
| per-ext `lib/` (du) | see appendix | — |

## Notes / anomalies
_(fill: any spread >20% → session discarded; MAMP-vs-direct delta; etc.)_
