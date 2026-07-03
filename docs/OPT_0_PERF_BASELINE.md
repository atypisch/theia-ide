# OPT Phase 0.2 — Performance baseline

**Date measured:** 2026-07-02/03 · **Rule:** measured, not "feels" — every Phase-3 claim is re-measured against these tables with the *exact same commands*. Zero code changes (browser-side observation + the existing `@theia/metrics` endpoint).

## ✅ Measurement status: MEASURED (host idle; launchd benchmark finished)

First pre-flight (2026-06-30) was blocked by a launchd-scheduled deepseek benchmark; the measurement ran in the next idle window on the **`pre-optimalisatie-baseline` tag artifact** (fresh prod build) so it reflects the UNMODIFIED IDE, before any Phase-1 fix.

## Environment fingerprint

| Field | Value |
|-------|-------|
| Date/time | 2026-07-02 21:18 (cold-start session) + 2026-07-03 09:02 (warm/memory session) |
| Built from | tag `pre-optimalisatie-baseline` (fresh prod build; lib/ artifact reused across both sessions) |
| Build mode | prod — `yarn build` → `theia build --app-target=browser` (no `--mode development`) |
| macOS / Node / yarn | 15.7.3 / v24.11.1 / 1.22.22 |
| RAM | 16 GB |
| Ollama pre-flight | idle (`api/ps` empty), 0 benchmark processes |
| Test workspace | `/Users/martentiman/Sites/sumezi` (fixed for all future runs) |
| Measured on | `http://localhost:3000` direct (MAMP-proxy secondary run still to do — noted below) |

**Teardown honored (RAM discipline):** MCP browser closed + backend killed + port-3000 verified 0 listeners after each session.

## Build baseline (also a Phase-3 metric)

- Command: `/usr/bin/time -l yarn build` (prod)
- **Wall-clock: 40.6 s** · build peak RSS: 490 MB · exit 0

## Metric 1 — Cold start

Backend: launch-timestamp vs "Theia app listening" log line. Frontend: playwright `browser_navigate` → `performance` entries. 1 cold + 4 warm reloads.

| Measure | Cold | Warm p50 (n=3) | Warm min–max |
|---------|-----:|---------------:|-------------:|
| Backend-ready | **1.7 s** (0.79 s process-only) | — | — |
| First contentful paint | **244 ms** | 144 ms | 128–160 ms |
| loadEventEnd | **824 ms** | 136 ms | 115–140 ms |
| Shell settled (Theia `settled-start` marks) | ~1.6 s | — | — |

## Metric 2 — Time-to-first-agent-list

Resource-timing on `GET /api/v1/agents` (fires after shell settle): request start 2.69 s, **ready at ≈3.0 s** after navigationStart (round-trip 335 ms; engine `/api/health` 300 ms).

## Metric 3 — Time-to-first-token

- **Network TTFT** (POST `/api/worker`, first SSE byte, page-context fetch, 5 runs): **p50 ≈ 14 ms** — runs: 116 (cold connection), 11, 11, 14, 17 ms. **This is the IDE→engine pipeline overhead and it is negligible**; everything beyond it is engine/model latency.
- **Perceived TTFT** (MutationObserver at first token render): method failed this session (observer registered on a container query that missed the chat subtree) — **to redo next session**. The E2E turn itself completed: fixed prompt → `pilot / qwen2.5-coder:7b` → correct answer rendered with model transparency.
- Backing model at measure time (context only): qwen2.5-coder:7b, local.

## Metric 4 — Memory

Backend RSS via `/metrics` `process_resident_memory_bytes` (noisy on macOS — 27–120 MB swings; `ps` fallback recorded too). **JS heap (`performance.memory.usedJSHeapSize`) is the stable before/after signal.**

| Scenario | JS heap | Backend RSS (metrics / ps) |
|----------|--------:|---------------------------:|
| (a) idle, 60 s settled | **161 MB** | 68–120 MB (noisy) |
| (b) after 1 completed chat turn | 162 MB | 27 MB |
| (d) idle + 2 min after (b) | **163 MB** | 34 / 37 MB |
| **(d) − (a) leak indicator** | **+2 MB (flat)** | — |

- Scenario (c) — worker run with ≥3 tool calls — **deferred to the Checkpoint-1 demo**, where it doubles as the repeated-open/close leak test (a single turn barely exercises the #2/#6 leak paths; the demo matrix does).
- Note: one chat turn + idle shows a flat heap. The audited leaks (#2 stream survives close, #6 connection leak, #18/#20 timers) bite on *repeated open/close + interrupted streams* — that is the Checkpoint-1 measurement, run with these same commands.

## Metric 5 — Bundle sizes (prod build; stat + gzip, read-only)

| Artifact | Raw | Gzip |
|----------|----:|-----:|
| frontend `bundle.js` | **15,860,400 B (15.9 MB)** | **4,207,245 B (4.2 MB)** |
| frontend `bundle.css` | 2,735,517 B | — |
| `secondary-window.js` | 12,887,544 B | — |
| `plugin-worker.js` | 3,896,160 B | — |
| `editor.worker.js` | 2,088,559 B | — |
| `secondary-window.css` | 2,405,275 B | — |

The previously-recorded 32.4 MB `bundle.js` was a **dev build** — the honest prod baseline is 15.9 MB raw / 4.2 MB transfer. Per-module attribution (esbuild metafile) = Phase-3 commit 1.

## Repeat commands (for every re-measurement)

1. Pre-flight: `curl -s localhost:11434/api/ps` empty + no `-m benchmarks` processes + fingerprint.
2. Build: `/usr/bin/time -l yarn build` (record wall + RSS).
3. Backend: `cd applications/browser && yarn start` with timestamped log; ready = "listening" line.
4. Playwright: navigate :3000 → wait shell → dump `navigation`/`paint`/`mark` entries; 4 reloads for warm.
5. Agents: resource-timing on `/api/v1/agents`. TTFT: page-context fetch ×5 on `POST /api/worker`, first `reader.read()`.
6. Memory: heap via `performance.memory` + `/metrics` RSS at scenarios (a)/(b)/(c)/(d) with 60 s/2 min settles.
7. Teardown: `browser_close`, kill backend, verify port 3000 has 0 listeners.

## Notes / anomalies

- Backend `/metrics` RSS fluctuates heavily (27–120 MB) — likely GC + macOS accounting; use JS heap as primary, `ps` RSS as backup.
- MAMP-proxy secondary measurement + perceived-TTFT redo: next session (direct-`:3000` numbers are the primary baseline).
- Load averages were moderate during the warm session; TTFT/paint spreads were tight (<20%), so the session is valid per protocol.
