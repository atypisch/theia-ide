# Prompt voor Claude Design — Soriku IDE

> Stuur `SORIKU_IDE_SYSTEM_OVERVIEW.md` mee als context. Onderstaande prompt verwijst ernaar.

---

Je ontwerpt de visuele identiteit en kernschermen van **Soriku IDE** — een agent-first, lokaal-eerst AI-coding-IDE die een **standalone desktop-applicatie** wordt (Electron, geen browser-app) en die **supersnel** en **state-of-the-art** moet aanvoelen. Lees eerst het meegestuurde **System Overview**; dat is de bron van waarheid voor wat de app is, wie de gebruiker is, welke schermen/toestanden bestaan en binnen welke technische kaders je werkt.

## Wat ik van je wil

Een samenhangend **ontwerpsysteem + de belangrijkste scherm-ontwerpen**, gepresenteerd als bekijk­bare artifacts (HTML/CSS-mockups of hoogwaardige visuele specificaties), theme-aware (licht **en** donker), klaar om door engineers naar Theia-widgets vertaald te worden.

### A. Ontwerpsysteem (de fundering)
1. **Kleur** — een palet voor licht + donker dat naast Theia's editor-kleuren leeft zonder ermee te vloeken; semantische rollen (achtergrondlagen, tekst-hiërarchie, accent, succes/`verified`, waarschuwing/`fixing`, error, worker-status-kleuren). Lever de tokens als CSS-variabelen.
2. **Typografie** — schaal + fonts voor een dichte desktop-tool (code-mono + UI-sans; het bestaande soriku-web gebruikt Geist/Newsreader — mag consistent, hoeft niet). Leesbaar bij hoge informatiedichtheid.
3. **Spacing, radius, elevatie, dichtheid** — desktop-dicht, keyboard-first, geen web-witruimte-overdaad.
4. **Iconografie & de agent-avatar-taal** — hoe personas (initialen/rol/categorie) visueel herkenbaar worden; status-dots voor workers.
5. **Motion** — subtiel, snel, GPU-vriendelijk (streaming-cursor, worker-status-overgangen). "Supersnel" moet je voelen; geen zware animaties.

### B. Kernschermen (ontwerp deze, met hun toestanden)
1. **Chat — de held.** Ontwerp álle toestanden uit §4.1 van het overview: streaming antwoord met model-transparantie-badge; de drie pickers (behaviour / models / routing); de **plan-approval-kaart** (taken + per-taak model + kosten + inline-edit + Approve/Cancel); de **Fleet-view** (parallelle workers met model/files/corrections/verdict, geneste minions); **tool-confirmation + diff-review**; **verify-pills** (`verified ✓` / `fixing`); gegenereerde-files-lijst + live-growing diff; en de reliability-toestanden (`interrupted + Retry`, `auth required`, `error`, `stopped`). Dit is het belangrijkste — besteed er de meeste zorg aan.
2. **Agents-grid + agent-editor.**
3. **Ondersteunende panels** (één consistent patroon dat werkt voor): Models, Capability Map (datatabel/heatmap), MCP Servers, Routing Overrides, Conversations.
4. **De shell-integratie:** hoe activity bar, side panels, editor-area, status bar en engine-status-indicator samen één rustige, snelle desktop-app vormen — inclusief de **native desktop-framing** (titelbar-behandeling, geen browser-chrome).

### C. Leidende principes (hard)
- **Standalone desktop, niet web** — native venster-gevoel, dicht, keyboard-first, premium (denk Linear/Raycast-afwerking, niet generieke AI-chatwrapper).
- **Snelheid als identiteit** — niets in het ontwerp mag de net-geoptimaliseerde performance ondermijnen (virtualiseerbare lijsten, lichte assets).
- **Transparantie & controle** — de gebruiker ziet altijd welk model/agent wat doet; plan-goedkeuring, model-badges en verify-status zijn eersteklas, niet weggestopt.
- **Lokaal-privé als merk** — EU-hosted, geen telemetrie; straal privacy/eigenaarschap uit, geen cloud-first-cliché, geen "AI-paars-gradient" tenzij bewust en onderscheidend.
- **Binnen de Theia-shell** — je hebt veel vrijheid in styling/kleur/typografie/dichtheid/iconografie en in de chat/agent-surfaces, maar de macro-structuur (activity bar, panels, editor, status bar) ligt vast; ontwerp ermee, niet ertegenin.
- **Theme-aware + toegankelijk** — licht+donker, WCAG-contrast.
- **Model-agnostisch** — geen modelnamen als vaste UI-tekst; het antwoordende model is dynamisch en wordt getoond.

### D. Deliverables
1. Een **stylesheet/tokenset** (CSS-variabelen, licht+donker) als fundering.
2. **Bekijkbare mockups** van de kernschermen hierboven, met de belangrijkste toestanden — minimaal: chat-streaming, chat-plan-approval, chat-Fleet-run, chat-tool-diff, agents-grid, één ondersteunend paneel, en de shell-samenhang.
3. Een korte **rationale** per hoofdkeuze (waarom deze kleur/dichtheid/hiërarchie past bij een snelle, lokaal-privé, agent-first desktop-IDE).

Begin met het ontwerpsysteem (A), toon me dat eerst ter afstemming, en werk daarna de schermen (B) uit. Als een keuze afhangt van mijn voorkeur (bv. mate van kleuraccent, of hoe prominent de agent-personas visueel zijn), leg me 2-3 opties voor met een aanbeveling.
