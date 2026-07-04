# OPT Phase 5 — Orchestratie-integratie verificatie

**Date:** 2026-07-04 · Vraag (master-prompt §5): toont + bestuurt de IDE de engine's multi-agent/multi-model/worker-orchestratie correct, en welke gaps horen bij de engine? Engine-gaps staan in `OPT_5_ENGINE_GAPS.md`; dit doc verifieert de IDE-kant.

## Wat de IDE toont (bestaand, geverifieerd)

De orchestratie-visualisatie was al grotendeels gebouwd (Fase E/F) en is door Phase 1-4 correcter geworden (worker-attributie #7/#8, session-owner #15/#16). Concreet in `soriku-chat-widget.tsx`:

### §5.1 Multi-agent zichtbaarheid — **aanwezig**
- **Fleet-view** (`renderFleet`/`renderFleetRow`): één rij per parallelle worker/agent met status-dot, rol/agent-naam, **model**, aantal geschreven files, **corrections** (writes die de engine blokkeerde/herstelde — reliability-signaal), en review-**verdict** (✓ approved / ⟳ changes).
- **Geneste minions**: workers met `parentAgentId` nestelen onder hun head-agent (Fase F).
- **Agent-insights-paneel** (`AgentInsights`, Fase E): wat een agent geleerd heeft (decision-patterns/rules) — de "leert van feedback"-transparantie uit §5.1, voor zover de engine dit exposeert.

### §5.2 Multi-model transparantie — **aanwezig**
- Elke Fleet-rij toont het model van die worker; elke turn toont `model`/`respondedBy` (de "elk antwoord toont welk model"-belofte van het welkomstscherm). Verify-pills (`verified ✓`/`fixing`) tonen per tool-call de reliability-uitkomst.

### §5.3 Worker-besturing — **grotendeels aanwezig**
- **Conductor's plan** (`renderPlanApproval`): reviewbaar vóór uitvoering — per taak rol + **model** + **kostenschatting**, elke taak-goal **inline editbaar**, dan **Approve & run** / **Cancel** (`executePlan`/`cancelPlan`).
- Parallelle worker-outputs correct + attribueerbaar (Phase-1 #7/#8 fix; Fleet keyed op `workerId`).

## Geverifieerd hoe
- **Unit** (`chat-model.spec.ts`): `upsertAgent`/worker-attributie, de #7/#8 interleaved-two-worker fixtures, verdict/corrections-mapping.
- **Live** (Checkpoint 1 + 4): een delegated `list_directory` door de agent rendert correct in het tool/Fleet-pad; plan-approval-pad + execute/cancel bestaan; engine-kill mid-stream → interrupted zonder Fleet-corruptie.
- **Niet los live-getest**: een volledige multi-worker plan-run met ≥3 gelijktijdige workers (resource-zwaar op 16GB; de rendering is pure reductie uit events en is unit-gedekt). Aanbevolen als aparte live-sessie wanneer een plan-run gedraaid wordt.

## Gaps (IDE-kant → mogelijke vervolgstappen)

| Gap | Nu | Wenselijk | Eigenaar |
|---|---|---|---|
| **Per-worker stop/pause** (§5.3 "waar zinvol pauzeren/stoppen") | alleen hele-plan `cancelPlan`; geen losse worker-stop | een stop-knop per Fleet-rij | IDE-feature (klein) + engine-endpoint `cancel_worker` (bestaat nog niet → **engine-gap**) |
| **Worker-inspect** (live output per worker) | Fleet toont samenvatting (files/corrections/verdict); geen per-worker log-drilldown | klik-op-rij → die worker's stappen/output | IDE-feature; hangt op stabiele per-step `call_id` (= engine-gap **E3**) |
| **Multi-model synthesis-inspectie** (§5.2) | synthesis-stap draait engine-side; IDE toont het eindantwoord + welke modellen bijdroegen | zichtbaar "welk model deed welk deel" van de synthese | engine exposeert synthesis-attributie → **engine-gap** (toevoegen aan work order) |

Deze drie hangen alle (deels) op engine-endpoints/events die nog niet bestaan — ze horen dus in de **engine work order** (`OPT_5_ENGINE_GAPS.md`), niet als IDE-only feature gebouwd. De master-prompt is expliciet: geen orchestratie-logica in de IDE bijbouwen; escaleren.

## Conclusie
De IDE **toont** de orchestratie compleet (agents, modellen, plan, Fleet, reliability) en **bestuurt** de hoofdflow (approve/cancel/edit-plan). De resterende besturings-fijnmazigheid (per-worker stop/inspect, synthesis-attributie) vereist nieuwe engine-endpoints en is als zodanig geëscaleerd. Geen nieuwe IDE-orchestratielogica nodig of gebouwd.
