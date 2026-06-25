# Fase 0 — Sumezi baseline-meting (betrouwbaarheid)

Date: 2026-06-25. Scope: nulmeting van de huidige Soriku-engine-betrouwbaarheid op de
canonieke `sumezi` testcase, vóór de roadmap-fasen A–E. Dit document is het
regressie-ijkpunt waartegen Fase D/E verbetering moeten aantonen.

Bron: `~/Sites/soriku` engine (lokaal, `auth_mode=local`, `:8765`), aangestuurd via
`scripts/run-sumezi-testcase.py` (plan-mode, `pilot_tools`, persona `generalist`).
Workspace: `/Users/martentiman/Sites/sumezi`. SSE-logs in `/tmp/sumezi_testcase_*.sse.log`.

## Methode
Per run worden de SSE-events geteld en geclassificeerd: gekozen mode, aantal workers,
`worker_tool_call`-tools, geslaagde vs geblokkeerde `file_write`, en faalsignalen
(`worker_error`, `plan_failed`). "Geblokkeerd" = engine wees de write af via
`is_complete_deliverable()` (core/agent_loop.py:607) of `validate_file_write()`
(core/file_write_guard.py).

## Resultaten (3 recente runs, 24–25 jun 2026)

| Run (fase)   | mode | workers | tool_calls | file_write OK | file_write geblokkeerd | plan_done |
|--------------|------|---------|-----------|---------------|------------------------|-----------|
| t3-api       | plan | 4       | 8         | 1             | 0                      | ✅         |
| t4-wire-ui   | plan | 3       | 15        | 3             | 3                      | ✅         |
| t5-verify    | plan | 3       | 33        | 1             | **11**                 | ✅         |

Alle drie de runs eindigden in `plan_done` (geen `plan_failed`). De plannen *slagen*,
maar met sterk wisselende efficiëntie.

## Dominante faalklasse: "Incomplete deliverable" reject-loops
Lokale 7B-modellen emitten herhaaldelijk een `file_write` met onvolledige/ongeldige
inhoud (bijv. HTML die niet met `<!DOCTYPE`/`<html>` begint, tool-call-JSON als
bestandsbody, te kort, of een markdown-fence-wrapper). De completeness-gate in
`core/file_deliverable.py::is_complete_deliverable()` weigert die correct — **er landen
geen slechte bestanden** — maar elke weigering kost een hele worker-iteratie.

- **t5-verify**: 11 van 12 `file_write`-pogingen geblokkeerd (92%). Het model flailt
  door dezelfde gate voordat het één geldig bestand schrijft.
- **t4-wire-ui**: 3 opeenvolgende blokkades op `Dashboard.html` vóór succes, daarna
  schoon.
- **t3-api**: schoon (1 write, 0 blokkades) — bewijst dat de gate niet over-blokkeert;
  de variatie zit in modeloutput.

### Waarom dit het roadmap-ijkpunt is
1. **Onzichtbaar in de IDE** — een geblokkeerde write komt alleen als `error`-veld op
   `worker_tool_call` binnen; er is geen first-class `tool_blocked`/`tool_salvaged`
   event. De gebruiker ziet stilte, geen "engine corrigeerde het model". → **Fase A**.
2. **Betrouwbaarheids-/latencykost** — verspilde iteraties brengen runs dicht bij de
   iteratielimiet; bij t5-verify scheelde het weinig of het plan was alsnog gefaald. De
   block-rate is precies het runtime-faalsignaal voor confidence-escalatie. → **Fase D**.
3. **Leerbaar** — herhaalde blokkades van dezelfde klasse (bv. "HTML moet met `<` starten")
   horen één keer geleerd te worden, cross-agent per workspace. → **Fase E**.

## Bestaande failsafe-substraat (hergebruiken in Fase A)
- `core/file_deliverable.py` — `is_complete_deliverable()`, `extract_file_write_payload()`,
  `parse_tool_stub_from_body()`, `strip_markdown_fences()`, `sanitize_write_path()`.
- `core/agent_loop.py` — `_redirect_mistaken_file_write()` (salvage van tool-stub-in-body),
  reject-pad op regel 607–610.
- `core/file_write_guard.py` — `validate_file_write()` (pad/stack-guard).

**Bekend knelpunt:** zowel `file_write_guard.py` als `file_deliverable.py` bevatten
`sumezi`-specifieke padlogica (`_is_sumezi_workspace`, regex op `/Sites/sumezi`). Fase A
generaliseert dit naar het actieve workspace-pad zodat de guard voor elk project werkt.

## Ernstigste faalklasse: niet-terminerende tool-stub-lus
Een verse run (25 jun 12:52, default fase) op de toen-draaiende engine eindigde met
**`plan_done:false` én `plan_failed:false`** — inconcludent, iteratielimiet bereikt. Het
model schreef herhaaldelijk `file_write` naar `app/VERIFY.md` met als *inhoud* een
tool-call-JSON (`{"name": "file_read", "arguments": {...}}`), las het terug, listte de
map, en herhaalde — een lus die geen voortgang boekt en stil afloopt zonder succes of
duidelijke fout. Dit is precies de salvage-klasse (`_redirect_mistaken_file_write` /
`parse_tool_stub_from_body`) maar werd door de draaiende engine niet onderschept (oudere
code geladen vóór de gate/salvage; `error:null` op een `.md` met JSON-body terwijl
`is_complete_deliverable` die hoort te blokkeren). Conclusie: zowel de gate als de
zichtbaarheid moeten *live* staan — Fase A maakt deze lus zichtbaar (`outcome=salvaged`),
Fase D breekt hem af met escalatie.

## Baseline-cijfers (samenvatting)
- **Plan-succes:** 3/3 (`plan_done`), geen harde fouten.
- **file_write block-rate (gewogen over 3 runs):** 14 geblokkeerd / 19 totaal ≈ **74%**.
- **Cloud-escalaties:** 0 (alles lokaal — er is nog geen escalatieladder; Fase D).
- **Zichtbaarheid van blokkades in IDE:** geen (Fase A).

Doel voor Fase D/E: block-rate omlaag (door escalatie + leren), cloud-escalatie alleen
waar lokaal herhaald faalt, en elke correctie zichtbaar in Chat.
