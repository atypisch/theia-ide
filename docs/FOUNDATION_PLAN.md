# Soriku IDE — Foundation plan (punt 1 t/m 5)

**Doel:** de technische basis 100% kloppend maken vóór de ontwerp/UX-fase. Elk punt
heeft: huidige staat → wat "100%" betekent → concrete stappen → acceptatiecriteria.
Volgorde van waarde: 1 → 2 → 3 → 4 → 5 (1 deblokkeert 3).

---

## 1. Betrouwbaar capabel head-model

**Huidige staat (plumbing klaar, `b944104`):** de chat-agent leidt als orchestrerende
head; `resolve_orchestrator_model` pint de head aan `settings.orchestrator.model_hint`
(default `anthropic:claude-sonnet-4-5`) zodra die provider geregistreerd is, anders
nette lokale fallback. **Blokkade:** geen gefinancierd capabel model — Anthropic-key
geldig maar **0 credits**; Groq = free-tier (429 + 2 project-geblokkeerde modellen).

**100% =** de head draait betrouwbaar op een capabel model met schone tool_calls, geen
rate-limit, en de gebruiker kan dit per agent/sessie kiezen in de IDE.

**Stappen:**
- [ ] Provider financieren (gebruikersactie): Anthropic-credits (beste — frontier +
      schone tool_calls + geen limiet) **of** OpenAI-key **of** Groq betaald.
- [ ] Provider inschakelen in `data/settings.json` (`providers.<naam>.enabled=true`) —
      of een IDE-knop "enable provider" (kleine toevoeging).
- [ ] IDE-preference `soriku.orchestrator.headModel` die `settings.orchestrator.model_hint`
      zet (nu alleen engine-side instelbaar).
- [ ] Per-request override pad zodat de IDE-routingpicker "head-model" kan kiezen.

**Acceptatie:** een orchestratie-prompt → head op het capabele model → schone
`spawn_minions` → minions draaien → synthese. Geen 429/malformed. (= punt 3.)

---

## 2. Inline/tab-completion (Cursor-kernfeature)

**Huidige staat (gebouwd, `aa1f7f2` engine + `655f1e6` IDE):** `/api/complete` (FIM via
lokaal qwen2.5-coder, live geverifieerd: `return ` → `a + b`) + Monaco
inline-completion-provider (debounced 180ms, ctx-capped, Tab accepteert, pref
`soriku.completion.inlineEnabled`).

**100% =** snelle, relevante ghost-text in de praktijk, multi-line, met de juiste
context en zonder ruis.

**Stappen:**
- [ ] Live visuele verificatie: herladen, code typen, ghost-text zien + Tab.
- [ ] Latency-tuning: model warm houden (keep_alive), evt. een kleiner/sneller
      completion-model (qwen2.5-coder:1.5b) voor sub-100ms.
- [ ] Kwaliteit: betere stop-tokens, multi-line vs single-line heuristiek,
      taal-specifieke trimming (geen dubbele brackets/imports).
- [ ] Caching + dedup van identieke prefixes; niet vragen tijdens snelle bursts.
- [ ] Telemetrie (accept-rate) achter de telemetry-opt-in om kwaliteit te meten.

**Acceptatie:** typen in Python/TS/PHP geeft binnen ~150–300ms een zinnige
voltooiing; accept-rate meetbaar; uit te zetten via preference.

---

## 3. Bewezen live e2e-orchestratie

**Huidige staat:** deterministisch e2e bewezen (`092fd15`); live elk onderdeel los
bewezen (conductor-skip, capable head KIEST spawn_minions, salvage). **Nog niet** één
keer volledig live afgerond door 429 (free Groq) + 16GB.

**100% =** end-to-end live: head → minions (lokaal) → terugkoppeling → promotie →
synthese, zichtbaar in de Fleet-view, herhaalbaar.

**Stappen (na punt 1):**
- [ ] Eén schone live-run op een gefinancierd head-model (Sumezi), minions lokaal.
- [ ] Verifieer in de Fleet-view: geneste minions onder de head, `source="subagent"`
      feedback-entries, een gepromoveerde minion.
- [ ] Meet of een vervolgprompt gerichter is (insights-paneel) — bewijs dat het leren werkt.
- [ ] Stress: 2–3 parallelle minions binnen de OllamaMemoryManager-queue, geen OOM.
- [ ] Edge-cases: head zonder capable model → nette degradatie (geen placeholder).

**Acceptatie:** 3 opeenvolgende runs slagen end-to-end; fleet toont minions; learning
meetbaar; geen runaway/placeholder.

---

## 4. Codebase-brede semantische context (Cursor `@codebase`)

**Huidige staat:** RAG/embeddings-infra aanwezig (`core/rag.py`, `core/embeddings.py`,
`core/project_context.py`), maar **onduidelijk/ondiep gedraad** in de agent-context;
geen actieve repo-index per workspace.

**100% =** agents krijgen automatisch de relevante codebase-context (semantisch
opgehaald) bij elke prompt; `@file`/`@codebase`-achtige verwijzingen werken.

**Stappen:**
- [ ] Audit: wat doet `RAGPipeline`/`project_context` nu echt in de worker-context?
- [ ] Workspace-indexer: chunk + embed repo-bestanden (lokaal embed-model:
      `mxbai-embed-large`/`nomic-embed-text`), incrementeel bij wijzigingen.
- [ ] Vector-store per workspace (her)gebruiken; retrieval top-k in de
      worker-`shared_context` (naast `workspace_learnings`).
- [ ] IDE: `@file`/`@symbol`-mentions + (optioneel) `@codebase` in de chat-composer.
- [ ] Respecteer `.gitignore` + grootte-caps; lokaal-eerst (geen code naar cloud
      zonder toestemming — zie [[cloud-usage-must-be-optional]]).

**Acceptatie:** een vraag over de codebase haalt automatisch de juiste bestanden op;
agents redeneren over echte projectcode, niet alleen de prompt.

---

## 5. Snelheid

**Huidige staat:** lokaal-eerst op 16GB is traag (cold-loads, conductor-timeout >60s —
nu omzeild voor orchestratie; 120s worker-timeouts). Cloud-pad sneller maar
rate-limited op free tier.

**100% =** interactief responsief: completions <300ms, chat-eerste-token <2s,
orchestratie zonder cold-load-stalls.

**Stappen:**
- [ ] Model-warmhouden: keep_alive + preload van de actieve agent-modellen bij
      sessiestart (er is al warm-up-infra).
- [ ] Kleinere/snellere defaults voor interactief (completion 1.5b; chat 4b waar kan).
- [ ] Conductor: blijvend overslaan voor orchestratie (gedaan); voor gewone plannen
      een snel lokaal planner-model of cloud-conductor (`local_with_remote_conductor`).
- [ ] Concurrency-tuning OllamaMemoryManager (max_concurrent_models) per RAM-profiel.
- [ ] Meet p50/p95 latency per pad (completion/chat/plan) als regressie-guard.

**Acceptatie:** gemeten p95 binnen de targets op deze 16GB-machine met warme modellen.

---

## Volgorde & "100% vóór ontwerp"
1. **#1 financieren + inschakelen** (deblokkeert #3).
2. **#3 live e2e afronden + meten** (kernbelofte zichtbaar).
3. **#2 inline-completion polish** (dagelijkse snelheid/kwaliteit).
4. **#4 codebase-context** (grootste kwaliteitssprong na een capabel model).
5. **#5 snelheid** (doorlopend, met metingen als guard).

Pas als 1–5 op "100%/acceptatie" staan beginnen we aan het visuele ontwerp.
