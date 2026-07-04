# Soriku IDE — System Overview (voor Claude Design)

**Doel van dit document:** een designer het volledige mentale model geven van Soriku IDE — wat het is, voor wie, hoe het werkt, welke schermen/toestanden bestaan, en binnen welke technische + merk-kaders een ontwerp moet passen. Dit is de basis voor een **standalone desktop-app** die **supersnel** en **state-of-the-art** moet aanvoelen.

---

## 1. Wat is Soriku IDE — in één alinea

Soriku IDE is een **agent-first AI-coding-IDE**: een volwaardige code-editor waarin je niet met ruwe LLM's werkt maar met **agents** (personas met een rol, geheugen en specialisatie), lokaal-eerst en privacy-respecterend. Het is gebouwd op **Eclipse Theia** (VS Code-compatibel: editor, explorer, terminal, git, extensies) en praat met de **Soriku-engine** — een lokale Python-service (`:8765`) die routing, multi-agent-orchestratie, tool-executie en model-management doet. De kernbelofte: *"Work with agents, not raw models — en elk antwoord laat zien welk model het gaf."* Lokaal draaien is de default; cloud is optioneel en gecapt.

**Positionering:** Cursor-pariteit (inline completion, agent-chat, edits) **plus** iets dat Cursor niet heeft — echte multi-agent/multi-worker-orchestratie, lokale privacy (EU-hosted, geen telemetrie), en volledige transparantie over welk model wat deed.

---

## 2. De gebruiker

- **Primair:** ontwikkelaars die snelheid + privacy willen. De maker (Marten) werkt in Python, TypeScript/React, PHP — maar de IDE is stack-agnostisch.
- **Mentaliteit:** power-users die controle willen (welk model, lokaal vs cloud, plan-goedkeuring vóór uitvoering), geen black box. Willen "Cursor maar dan lokaal + met een team van agents".
- **Toon:** helder, direct, geen corporate-ruis, geen AI-superlatieven. NL óf EN. Het huidige welkomstscherm zegt letterlijk: *"Local-first AI coding. EU-hosted. No telemetry."*

---

## 3. Architectuur (wat een designer moet weten over dynamiek)

```
┌─────────────────────────── Soriku IDE (desktop app) ───────────────────────────┐
│  Eclipse Theia shell: menubar · activity bar · sidebars · editor · panel · status│
│  ─ 11 soriku-* extensies (de agent-laag) + Monaco-editor + standaard IDE-features │
│           │  HTTP + Server-Sent Events (streaming)                                │
└───────────┼───────────────────────────────────────────────────────────────────┘
            ▼
   Soriku-engine (lokale Python-service :8765)
   routing · agents/personas · Conductor→Workers→Minions · tools · model-management · MCP
```

**Belangrijk voor UX:** de IDE is een **view- en besturingslaag** over de engine. Antwoorden **streamen** token-voor-token binnen (SSE). Bij multi-agent-runs komen **meerdere gelijktijdige worker-streams** binnen die correct-geattribueerd getoond worden. De IDE bouwt zelf geen AI-logica — hij toont en bestuurt de engine. Ontwerp moet dus **real-time, streaming, en multi-stream** aankunnen zonder rommelig te worden.

**Wat draait waar (relevant voor "snel voelt"):**
- Lokale modellen via Ollama (bv. `qwen2.5-coder:7b`) — geen tokenkosten, wel geheugen (16 GB-hosts: één 7B-model tegelijk warm).
- Cloud-modellen (Claude/GPT/Groq) optioneel, per-request gecapt in EUR — **cloud is opt-in, nooit stilletjes**.

---

## 4. De UI-surfaces (wat er ontworpen moet worden)

Soriku voegt aan de Theia-shell deze eigen surfaces toe. **De chat is de held**; de rest zijn ondersteunende panels.

### 4.1 Chat (het hart — `soriku-chat`)
De centrale werkplek. Bevat veel toestanden die ontworpen moeten worden:
- **Streaming antwoord** met live token-render + **model-transparantie** (welk model/agent antwoordde, TTFT-badge).
- **Twee pickers** boven de input:
  - *Behaviour:* **Auto** · **Edit automatically** · **Plan** · **Chat only**.
  - *Models:* **Auto model** · **Single model** · **Ensemble**.
  - *Routing:* **Local-first** · **Hybrid** · **Balanced** · **Best quality** (waar compute draait).
- **Plan-approval-kaart** (Plan-mode): genummerde taken, **per taak rol + model + kostenschatting**, elke taak-goal **inline editbaar**, dan **Approve & run** / **Cancel**.
- **Fleet-view** (multi-worker): één rij per parallelle worker/agent met status-dot, rol/naam, **model**, aantal geschreven files, **corrections** (writes die de engine blokkeerde/herstelde), review-**verdict** (✓ approved / ⟳ changes). **Minions nestelen** onder hun head-agent.
- **Tool-confirmation + diff-review**: voordat een agent een file schrijft/patcht of shell draait, ziet de gebruiker een **diff** (accepteren/afwijzen) of een confirmation-banner; "allow always this session" per commando.
- **Verify-pills** per tool-call: **`verified ✓`** (code gecheckt + clean) / **`fixing`** (engine vond issues en corrigeert).
- **Gegenereerde files**: klikbare lijst → opent in editor; **live-growing diff** (code verschijnt terwijl het geschreven wordt).
- **Reliability-toestanden:** `streaming` · `interrupted` (transport-drop → partial behouden + **Retry**) · `error` · **`auth required`** (→ Sign in + Retry) · `stopped`.
- **Agent-insights-paneel**: wat deze agent geleerd heeft (decision-patterns/regels) — de "leert van feedback"-transparantie.
- **Feedback**: 👍/👎 per antwoord.

### 4.2 Agents (`soriku-agents` + `soriku-agent-edit`)
- **Agents-grid**: ~20 personas (bv. *Koda* de coder, *Soriku Code Reviewer*, *Master Planner*, *Soriku Frontend/Backend Developer*, *Humanizer*, …), elk met initialen-avatar, naam, categorie (coding/reasoning/general), beschrijving, en **Open chat** / **Edit**.
- **Agent-editor**: persona bewerken (system-prompt, rol, specialisaties).

### 4.3 Ondersteunende panels
- **Conversations** (`soriku-conversations`): chat-historie.
- **Models** (`soriku-models`): lokale/remote modellen beheren — pull, activeren, providers toevoegen.
- **Capability Map** (`soriku-capability-map`): modelscores per categorie (welk model is goed waarin) — een datatabel/heatmap-achtig scherm.
- **Routing Overrides** (`soriku-routing-overrides`): forceer een model per categorie.
- **MCP Servers** (`soriku-mcp`): externe tool-servers (Model Context Protocol) toevoegen/testen, wiens tools naar agents/workers stromen.
- **Engine-status** (statusbar): verbindingsstatus (auto-poll + reconnect), **Local mode**-indicator, engine-URL.

### 4.4 Editor-laag (Theia/Monaco — standaard, maar merk-consistent te stylen)
- Volledige code-editor met explorer, tabs, terminal, git, command-palette, settings.
- **Inline completion** (ghost-text, Cursor-style): lokaal FIM-model vult code aan bij de cursor, **Tab** accepteert.
- **Inline edit** (⌘K): agent bewerkt geselecteerde code ter plekke.

---

## 5. Kern-interactieflows (voor het ontwerp)

1. **Snelle vraag:** agent kiezen → typen → streaming antwoord met model-badge.
2. **Edit-flow:** "fix this" op een selectie → agent stelt een **diff** voor → accepteren → file verandert (live-growing diff in de editor).
3. **Plan-flow:** complexe taak → **plan-kaart** met taken/modellen/kosten → reviewen/editen → Approve → **Fleet** met parallelle workers → synthese → gegenereerde files.
4. **Tool-flow:** agent wil een tool draaien → confirmation/diff → uitvoeren → verify-pill.
5. **Herstel:** engine valt weg mid-stream → **interrupted + Retry**; engine komt terug → statusbar herstelt vanzelf.

---

## 6. Merk & huidige visuele identiteit

- **Logo/beeldmerk:** bestaat (`docs/design/logo_soriku.svg`, `logo_soriku_white.svg`, `soriku_beeldmerk.svg`).
- **Naam in-app:** "Soriku IDE".
- **Thema:** donker als default; **light + dark beide vereist** (Theia is theme-aware).
- **Waarden die de look moeten uitstralen:** lokaal/privé, snel, transparant (je ziet altijd welk model/agent), controle bij de gebruiker, premium maar niet luidruchtig. **Geen** generieke "AI-paars-gradient"-cliché tenzij bewust.
- **Bestaande soriku-web-app** (`~/Sites/soriku/frontend`) heeft al een eigen visuele taal (Geist/Newsreader-fonts, `--ink`/`--bg`-tokens, italic display-headings) — de IDE mag daar consistent mee zijn maar het is een **desktop-tool**, geen marketing-site.

---

## 7. Technische kaders die het ontwerp respecteert

- **Eclipse Theia-shell**: het ontwerp moet mappen op Theia's structuur — **activity bar** (icon-rail links), **side panels** (links/rechts), **editor-area** (midden, tabs), **bottom panel** (terminal/output), **status bar**, **menubar**, **command palette**. De soriku-panels zijn Theia-widgets in die shell. (Een volledig vrij canvas is het niet — maar binnen die shell is veel vrijheid in styling, iconografie, dichtheid, kleur, typografie, en de chat/agent-surfaces.)
- **Standalone desktop (Electron)**: de app wordt **geen browser-tab** maar een **native desktop-venster** (`applications/electron`, electron-builder aanwezig). Ontwerp voor een desktop-app: eigen titelbar-mogelijkheden, native gevoel, geen browser-chrome, keyboard-first, dichte informatie zonder web-achtige witruimte-overdaad.
- **Performance is een feature**: er is net een optimalisatieslag gedaan (agent-lijst laadt in ~1,6 s, prod-bundle 15,9 MB, geen memory-leaks, streaming zonder jank). Het ontwerp mag dit **niet** ondermijnen: geen zware animaties/afbeeldingen die de snelheid slopen, virtualiseerbare lijsten, GPU-vriendelijk. "Supersnel" moet je **voelen**.
- **Theme-aware + toegankelijk**: WCAG-contrast, licht/donker, respecteer Theia-color-tokens waar mogelijk zodat de editor consistent blijft.
- **Model-agnostisch**: nergens modelnamen hardcoden in de UI-taal; het model dat antwoordt is dynamisch en wordt getoond, niet aangenomen.
- **Geen telemetrie**: geen tracking-UI, geen "help ons verbeteren"-nudges.

---

## 8. Wat "state-of-the-art" hier betekent

Niet "meer chrome", maar: **rust + snelheid + vertrouwen**. Een IDE waar de AI-samenwerking (agents, plan, Fleet, model-transparantie, verify) **eersteklas en leesbaar** is, waar de streaming soepel voelt, waar de gebruiker altijd weet wat er gebeurt en wie het doet, en die als premium native desktop-tool aanvoelt — dichter bij Linear/Raycast-niveau van afwerking dan bij een generieke AI-chatwrapper. Lokaal-privé als identiteit, niet als bijzin.

---

## 9. Design-scope (wat we van Claude Design vragen — samengevat)

Een **visueel ontwerpsysteem + kernscherm-ontwerpen** voor de desktop-app: kleur/typografie/spacing/iconografie-tokens (licht+donker), de **chat-surface met al zijn toestanden** (streaming, plan-approval, Fleet, tool-diff, verify-pills, interrupted/auth), de **agents-grid**, de **ondersteunende panels** (models/capability-map/MCP/routing/conversations), de **statusbar/engine-status**, en hoe dit alles binnen de Theia-desktop-shell samenkomt tot iets snels, rustigs en onderscheidends. De begeleidende prompt (`CLAUDE_DESIGN_PROMPT.md`) specificeert de exacte deliverables.
