# OPT Phase 6 — Handoff

**Date:** 2026-07-04 · De optimalisatieslag (correctheid → context → performance → architectuur → orchestratie-verificatie) is klaar op `defork/option-c`. Volgende fases zijn apart: **Claude Design** (visueel/UX), **desktop-packaging** (Electron/Tauri), en de **engine work order** (`OPT_5_ENGINE_GAPS.md`).

## Wat is geoptimaliseerd (met vóór/ná)

### Phase 1 — correctheid (20 auditbevindingen, alle gefixt)
2 blockers + 12 majors + 6 minors. Kern: tool-approval-deadlock (#1), widget-`dispose()` (#2), SSE-robuustheid (#3-6: typed transport-error, idle-watchdog, reader.cancel, interrupted+retry), worker-attributie (#7/#8), status-polling+backoff (#9/#13), auth-re-auth (#14), 2 security-fixes (#11 path-containment, #12 shell-allowlist per commando). **Live geverifieerd:** engine-kill mid-stream → interrupted+retry (geen rode error); engine down/up → statusbar auto-herstel zonder reload.

### Phase 2 — context-kwaliteit (voedt de engine)
- **C-B (grootste stille winst):** `Workspace: /pad`-format i.p.v. `Workspace root:` → engine-extractors matchen weer. **Bewezen:** oud format → alle 3 extractors `None` op een niet-sumezi project; nieuw → correct. Learnings/soriku.md/write-guard werken nu voor IDE-chats.
- **C-A:** live editor-context (actieve file, selectie, cursor-window, open tabs) → engine. **Request-diff gecaptured** uit de draaiende IDE.
- **C-D:** strikte patcher (offset-hunk gooit fout i.p.v. stille corruptie). **C-E:** line-aware FIM-window.
- Engine-helften geëscaleerd (`OPT_5_ENGINE_GAPS.md` E1-E8).

### Phase 3 — performance (gemeten, `OPT_3_PERF_RESULTS.md`)
| Metric | Baseline | Nu | Δ |
|---|---:|---:|---|
| Time-to-first-agent-list (cold) | ~3,0 s | **1,58 s** | **−47 %** |
| …(warm reload) | ~3,0 s | **0,46–0,63 s** | **~5×** |
| Build (prod) | 40,6 s | 30–33 s | sneller |
| loadEventEnd / JS-heap | 824 ms / 161 MB | ~820 ms / ~160 MB | onveranderd (geen regressie) |
| Prod-bundle bundle.js | (32,4 MB was dev-build) | **15,9 MB / 4,2 MB gzip** | echte baseline vastgelegd |

Metafile-attributie toegevoegd (build-tool). Feature-trims = open productkeuze (zie onder).

### Phase 4 — architectuur
Chat-widget 1250 → **1140** r.; stream-lifecycle → `ChatStreamController` (124 r., 8 nieuwe DOM-loze tests), conversatie-state → `ChatSessionService` (184 r.). De #15/#16-bugklasse structureel onmogelijk (één state-owner). Gedrag byte-identiek; live geverifieerd op de gerefactorde build.

### Phase 5 — orchestratie-verificatie
IDE toont orchestratie compleet (Fleet per-worker met model/files/corrections/verdict, geneste minions, plan-approval met per-taak model+kosten+edit, execute/cancel) en bestuurt de hoofdflow. Fijnmazigere besturing (per-worker stop/inspect, synthesis-attributie) → engine work order.

## Eindstaat
- **239 tests / 12 extensies / 3× schoon** (was 205 aan het begin van Phase 1; +34 nieuwe, 0 aangepast).
- **Hygiëne schoon:** 0 `any` in signatures, 0 hardcoded modelnamen in runtime, 0 lege catches, 0 TODO.
- **33 commits** sinds de baseline-tag (`pre-optimalisatie-baseline`), waarvan 19 code; atomair, elk met auditnummer waar van toepassing.
- **6 nieuwe modules**, geen circulaire deps, geen Theia-source-patches, model-agnostisch.

## Bewust NIET aangeraakt
- **Visueel design / UX** → Claude Design-fase.
- **Desktop-packaging** → aparte fase na design.
- **chat-model/engine-types splitsen** → churn zonder gedragswinst (sectiekopjes volstaan).
- **Chat-history-virtualisatie** → nu mogelijk gemaakt door de P4-decompositie; implementeren wanneer een lange-historie jank-meting het rechtvaardigt.

## Openstaande beslissingen voor Marten
1. **Feature-trims** (`OPT_3_PERF_RESULTS.md` tabel): `@theia/preview` (~1 MB incl. highlight.js), `@theia/notebook` (~190 KB), `@theia/memory-inspector` (~105 KB), `@theia/vsx-registry` (~75 KB). Elk = zichtbare feature eruit → jouw keuze.
2. **Engine work order** (`OPT_5_ENGINE_GAPS.md`, E1-E8): aparte engine-sessie in `~/Sites/soriku`. Advies-volgorde E2 (soriku.md/learnings op het single-agent chat-pad) eerst — kleinste, elke chat profiteert.

## Bekende resterende beperkingen
- Perf-baseline's **perceived-TTFT** + **MAMP-proxy secundair** + **multi-worker memory-scenario (c)** zijn overgeslagen (host/tijd); network-TTFT (~14 ms IDE-overhead) + de leak-indicator (vlak) zijn wel vastgelegd.
- Engine-afhankelijke IDE-fixes degraderen gracieus zonder hun engine-helft (C4c-resume, C5-correlatie, B/C-context) — volledige robuustheid komt met de work order.

## Reproduceerbaarheid
Alle metingen: `docs/OPT_0_PERF_BASELINE.md` (protocol + commando's) → `docs/OPT_3_PERF_RESULTS.md` (deltas). Elke fase heeft een eigen `OPT_*`-doc. Baseline-artifact herbouwbaar vanaf tag `pre-optimalisatie-baseline`.
