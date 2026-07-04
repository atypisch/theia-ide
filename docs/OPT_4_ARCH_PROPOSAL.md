# OPT Phase 4 — Architectuurvoorstel (ter review vóór implementatie)

**Date:** 2026-07-03 · Status: **voorstel — wacht op Checkpoint-4 go.** Regels: gedrag byte-identiek (231 tests + live smoke bewijzen dat), mechanisch verplaatsen zonder herschrijven, één commit per extractie.

## Waarom (uit de audit + wat Phase 1-3 leerde)

`soriku-chat-widget.tsx` is na de fixes **1250 regels** en mengt vier verantwoordelijkheden: rendering, stream-lifecycle, conversatie-state/persistentie, en external-plan-ingestie. Dat was de wortel van blockers #2/#15/#16 (state-mutaties vanuit meerdere flows op één mutable array) en blokkeert de Phase-3-deferred virtualisatie (windowed rendering kan pas als rendering los staat van state). De hygiëne-audit vond verder níets mis met types/catches — dit is de enige structurele ingreep die het waard is.

## Voorstel: 3 extracties uit soriku-chat (in deze volgorde)

### P4-a — `browser/chat-stream-controller.ts` (~200 regels)
De send/stream-lifecycle uit de widget: AbortController-beheer, de `for await`-loop, `reduceSseEvent`-dispatch, de typed-error-mapping (#3/#5/#14: aborted→done, interrupted→retryable, auth→sign-in), tool-event fan-out (confirm/executeDelegated/plan-execute), retry.
- **Interface:** `start(params, callbacks: { onTurn(turn), onEvent(event) }): handle` + `abort()`. De widget wordt puur consumer.
- **Testbaar zonder DOM** met een fake EngineClient-stream — de C4-scenario's (malformed frame, drop, auth) krijgen dan directe controller-tests i.p.v. alleen reducer-tests.
- Dit voltooit ook de C3-intentie (dispose→abort loopt dan door één object).

### P4-b — `browser/chat-session-service.ts` (~250 regels)
Conversatie-state uit de view-laag: `conversation[]`, `conversationId/titel`, persist/restore (`StorageService`), external-plan-follow + live-ingestie (#15-guard verhuist mee), feedback-state.
- **Injectable service met `onDidChange`-event**; de widget rendert `service.getConversation()`.
- Lost de laag-schending op (view deed state-orkestratie) en maakt de #15/#16-klasse structureel onmogelijk i.p.v. per-geval gepatcht.

### P4-c — Widget = rendering (~650-700 regels over)
Alleen render-methodes, input-handling, picker-UI. Daarná is virtualisatie (Phase-3-deferred) een gecontroleerde wijziging in één render-pad.

## Bewust NIET voorgesteld

- **`chat-model.ts` (727) opsplitsen:** de reducer is nu goed gecommentarieerd, puur en volledig getest; splitsen in types/correlatie/reduce is churn zonder gedragswinst. Sectiekopjes volstaan (doe ik in P4-a-commit mee).
- **`engine-types.ts` (530):** contract-file; alleen sectiekopjes.
- **Verdere hygiëne-passes:** audit vond 0 `any`/lege catches/TODO's — niets te doen.
- **Feature-trims uit Checkpoint 3:** blijven een open productkeuze van Marten (preview/notebook/memory-inspector/vsx) — geen onderdeel van dit voorstel.

## Risico's + mitigatie

1. **Hotste file van de app** — mechanisch verplaatsen (geen logica-wijziging), per extractie: volledige suite 3× + live smoke (chat-turn, stop, engine-kill→interrupted, panel-sluiten→heap vlak) via het vaste meetprotocol.
2. **DI-cycli** — controller/service wonen in soriku-chat zelf (geen nieuwe cross-extensie-deps).
3. **Regressie in de C1-C8-fixes** — de bestaande 231 tests pinnen exact dat gedrag; elke extractie moet groen blijven zonder test-aanpassingen (verplaatste imports uitgezonderd).

## Verificatie (per commit + eindcheckpoint)

Suite 3× schoon · live demo-matrix van Checkpoint 1 herhaald op het eindresultaat · hermeting memory-scenario (d)−(a) · `wc -l`-tabel vóór/ná in het checkpoint-rapport.
