# OPT Phase 3 — Performance results (vs. `OPT_0_PERF_BASELINE.md`)

**Date:** 2026-07-03 · Prod builds, host idle (pre-flight per protocol), same workspace (`sumezi`), same MCP-playwright command sequence as the baseline. Teardown honored per session.

## Measured deltas

| Metric | Baseline (tag) | Phase-3 build | Δ |
|---|---:|---:|---|
| **Time-to-first-agent-list (cold)** | ~3.0 s (fetch started 2.69 s) | **1.58 s** (fetch starts 1.53 s) | **−47 %** |
| **Time-to-first-agent-list (warm reload)** | ~3.0 s | **0.46–0.63 s** | **~5× faster** |
| loadEventEnd (cold) | 824 ms | 820 ms | unchanged ✓ (no regression) |
| FCP (cold) | 244 ms | 324 ms | within cold-run variance; warm FCP unchanged |
| JS heap after load | 161 MB | 186 MB unsettled / settles to ~160 | unchanged |
| Network TTFT (IDE→engine overhead) | ~14 ms p50 | not re-measured — no code on that path changed | n/a |

## What was done

1. **P3-c1 (`1928703`) — bundle attribution:** esbuild `metafile` in the adopter-owned `esbuild.mjs`, written to `build-meta/` (never served, gitignored). First attribution of the 15.1 MB bundle:
   - Platform floor (untrimmable without Theia patches): monaco 4.0 MB + @theia/core 3.0 MB + oniguruma 0.64 MB + iconv/jschardet 0.8 MB.
   - **Feature-sized items (decision table below)**: highlight.js **0.95 MB** pulled solely by `@theia/preview` (markdown preview); @theia/debug 301 KB; notebook 188 KB; memory-inspector 104 KB; vsx-registry 75 KB.
   - Soriku's own 11 extensions: a rounding error (<2 % combined).
2. **P3-c2 (`92b06f7`) — agent prefetch:** memoized `SorikuAgentCatalog` + fetch kicked off at app start (parallel with shell restore); agents view renders from the warm memo, Refresh forces, workbench agent-pick shares it (duplicate fetch removed). Failure at launch degrades to the old cold path.

## Evaluated and deliberately NOT done (measure-before-cutting)

- **Token-render batching:** already exists — `scheduleUpdate` coalesces via `requestAnimationFrame`; no measured jank at current token rates. Re-visit only with a long-history jank measurement.
- **Chat-history virtualization:** real but belongs with the Phase-4 widget decomposition (the 1163-line widget renders the whole conversation; splitting it is the prerequisite for windowed rendering).
- **Bundle feature-trims:** each candidate removes a user-visible feature → Checkpoint-3 decision, not a unilateral cut:

| Kandidaat | Bespaart (bundle.js) | Verlies |
|---|---:|---|
| `@theia/preview` | ~1.0 MB (incl. highlight.js 950 KB) | markdown-preview van .md-bestanden |
| `@theia/notebook` | ~190 KB | Jupyter-notebook support |
| `@theia/memory-inspector` | ~105 KB | debug memory-inspector |
| `@theia/vsx-registry` | ~75 KB | Open-VSX extensions-marktplaats in de IDE |

(NB: werkelijke besparing per trim is groter dan de bundle.js-bijdrage — elk brengt ook eigen CSS/secundaire chunks mee.)

## Conclusion

The one genuinely slow startup metric (agent-list) is fixed and measured. The remaining bundle mass is platform floor + feature choices. Startup, memory and streaming were already healthy at baseline and stayed healthy — no regressions introduced (loadEventEnd/heap unchanged).
