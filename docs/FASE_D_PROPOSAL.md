# Fase D — Hybride confidence-escalatie routing (proposal)

Date: 2026-06-26. Status: **proposal, awaiting approval before any engine change.**
Boundary: alle wijzigingen hieronder zitten in de engine (`~/Sites/soriku`) en worden
alleen na expliciete goedkeuring per stap gebouwd. localhost/soriku blijft ongemoeid.

## Context / motivatie (live waargenomen)
Tijdens de Fase C-verificatie bleef de **lokale conductor (`qwen2.5-coder:7b`) hangen tot
timeout (60s)** en faalde het plan — terwijl modellen op 16GB constant koud (her)laden, en
de "remote conductor" geen bruikbaar cloud-model had. De engine **escaleert vandaag niet**:
hij blijft op een te traag/falend lokaal model staan tot het opgeeft. Doel van Fase D:
lokaal-eerst, maar **nooit stilstaan** — escaleer *gemeten* (confidence + runtime-faalsignalen)
naar een sneller model / verify / ensemble / cloud, **gegate door kostencaps en de gekozen
routing-strategie** (cloud alleen als vangnet, conform de hybride keuze).

## Bevindingen in de huidige code
- `core/conductor.py`: `_FALLBACK_CONDUCTOR_MODELS = ("ollama:deepseek-r1:7b",
  "ollama:qwen2.5-coder:7b")` wordt alleen geprobeerd als het routed model **"unavailable"**
  is. Een **timeout** valt NIET terug → `ConductorTimeoutError` → plan faalt. (Kern van D1.)
- `core/smart_router._select_mode(prompt, confidence)` → `single|verify|ensemble` op
  keyword + statische confidence. Nog niet uitkomst-bewust.
- `core/verify.py` (`VerifyPipeline.run`) en `core/ensemble.py` (`EnsemblePipeline.run`)
  bestaan als async generators — herbruikbaar als escalatietrappen.
- `core/routing_policy.py` kostencaps + de per-request routing-strategie (Fase C/D-IDE,
  `routing_strategy`) bepalen of cloud is toegestaan.

## Ontwerp — 4 onderdelen

### D1 — Conductor-escalatie (eerst; lost de live timeout op, kleinste wijziging)
- `core/conductor.py`: bij **timeout / empty / provider-error** (niet alleen "unavailable")
  escaleer naar de volgende kandidaat i.p.v. hard falen.
- Ladder: routed lokaal → ander lokaal reasoning-model (`deepseek-r1:7b`) → (alleen als de
  strategie cloud toestaat én binnen budget) `claude-opus-4-8` (snel + betrouwbaar voor
  plan-JSON).
- Emit `ESCALATION {from, to, reason: "conductor_timeout"}`.
- Effect: plan-faalkans door conductor-timeout daalt drastisch.

### D2 — Uitkomst-bewuste mode-selectie
- `_select_mode` confidence verrijken met: capability-map-score (bestaand) + agent
  `decision_patterns`-sterkte voor de categorie + een **runtime-faalsignaal** (recente
  `tool_blocked`/`salvaged`-rate uit Fase A, verify-disagreement, conductor-timeouts per
  workspace). Lage confidence → hoger op de ladder.

### D3 — Escalatieladder voor het antwoord (workers)
- In `core/agent_loop.py`/worker: lokaal single → goedkope post-hoc check faalt (guard-block,
  leeg/`is_error_marker`, verify-disagreement) → `verify.py` (2-model consensus) →
  `ensemble.py` (N-model) → laatste redmiddel hardste subtaak naar `claude-opus-4-8`.
- Gegate door `routing_policy` kostencaps (`max_cost_per_day_eur`); cloud alleen binnen budget
  én als de strategie het toestaat.

### D4 — Zichtbaarheid (events + IDE)
- Nieuwe events in `core/plan_events.py`: `CONFIDENCE_ESTIMATED {score, mode}` +
  `ESCALATION {from, to, reason}` (de generieke plan-event-passthrough in server.py:4217
  stuurt ze automatisch door — geen server-wijziging).
- IDE (soriku-chat): reducer-cases + een chip in de chat ("geëscaleerd naar Opus 4.8 — lage
  lokale confidence 0.42" / "conductor-timeout → deepseek-r1"), hergebruik het bestaande
  model-chip-patroon. Per-workspace lokaal-only/allow-cloud staat al in de routing-picker.

## Respect voor de routing-strategie (hybride keuze)
- `prefer_local` (strict): escaleert **alleen lokaal** (ander lokaal model / verify /
  ensemble), nooit cloud.
- `local_with_remote_conductor` (hybrid): lokale workers, conductor mag cloud als vangnet.
- `balanced` / `prefer_quality`: cloud-escalatie toegestaan binnen budget.

## Verificatie
- **Unit:** `_select_mode` confidence-blend; conductor-escalatie op timeout (mock traag model
  → escaleert i.p.v. faalt); cost-cap gate (over budget → geen cloud).
- **E2e (Sumezi-regressiegate):** `scripts/run-sumezi-testcase.py` logt per fase: gekozen
  mode, escalaties, pass/fail, kosten. Doel t.o.v. de Fase 0-baseline: lokale betrouwbaarheid
  omhoog, cloud-escalatie alleen waar lokaal herhaald faalt.

## Voorgestelde volgorde
1. **D1** (conductor-escalatie) — kleinst, lost de live timeout op. Aparte commit + test.
2. **D2** (uitkomst-bewuste confidence).
3. **D3** (antwoord-escalatieladder).
4. **D4** (events + IDE-chips).

Elke stap: afgebakende engine-wijziging, vooraf bevestigd, met test + groen houden van de suite.
