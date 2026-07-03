# Engine work order — gaps die alleen engine-side kunnen (uit OPT Phase 1–2)

**Status:** wacht op sign-off (Checkpoint 2). Alle items zijn ENGINE-werk (`~/Sites/soriku`); per master-prompt niet in de IDE gebouwd. Elke IDE-fix degradeert gracieus zonder deze items — ze maken het robuuster/exacter, niets is erdoor geblokkeerd.

## E1 — Structured guard-context (B-ENGINE; maakt de IDE prompt-prefix overbodig)
- **Nu:** guard-extractors (workspace_learnings.py:63, file_write_guard.py:39, agent_loop.py:1113) greppen `workspace:` uit de USER-prompt; `ChatRequest.context`-items belanden in de system-prompt en bereiken ze nooit. De IDE prefixt daarom het wire-prompt met `Workspace: /pad` (commit 5e44f83) — werkt, maar staat in de opgeslagen user-message.
- **Gewenst:** thread `ChatRequest.context`/`project_id` structureel naar `set_guard_context` + de extractors; verwijder de eigen-repo-fallback "Project file structure" (server.py:3168-3177). Daarna kan de IDE-prefix weg.

## E2 — soriku.md + learnings ook op het single-agent pad
- **Nu:** `project_guidelines.build_guidelines_block` en `workspace_learnings.build_context_block` worden geïnjecteerd in `core/worker.py _build_user_prompt` (plan-mode workers). Een gewone IDE-chat loopt via de PilotLoop (server.py `_stream_agent_response`) en krijgt ze **niet**.
- **Gewenst:** dezelfde injectie (workspace uit guard-context) op het single-agent pad, zodat soriku.md-richtlijnen elke chat sturen.

## E3 — Tool-event correlatie-ids (#7/#8 exact maken)
- **Nu:** `worker_tool_call` draagt `worker_id` maar geen per-step `call_id` (core/worker.py:302-310); `tool_request` draagt `request_id` maar geen `worker_id` (server.py:2954-2960). De IDE lost dit op met worker-scoped matching + adoptie van unowned entries (commit feff08b) — FIFO-ambiguïteit blijft bij twee gelijknamige pending delegated calls van verschillende workers.
- **Gewenst:** (a) een stabiele `call_id` per PilotStep, meegestuurd op `worker_tool_call`; (b) `worker_id` op `tool_request` wanneer de delegatie uit een worker-context komt. IDE-matching pakt ze automatisch op (`callIdOf` leest `call_id` al).

## E4 — Stream-resume token (#5 echte resume)
- **Nu:** transport-drop = IDE toont interrupted + handmatige Retry (heel de turn opnieuw). Automatische retry is bewust uitgesteld: een her-run kan tools/writes dupliceren.
- **Gewenst:** event-ids + een resume-endpoint (`Last-Event-ID`-semantiek) of idempotente turn-replay, zodat de IDE na een drop kan hervatten zonder dubbele side-effects.

## E5 — Cross-turn history-verrijking (C-C)
- **Nu:** history wordt server-side gereconstrueerd uit de laatste 20 user/assistant-teksten (server.py:3405-3416); tool-results, plan-state en fleet-context van eerdere turns verdwijnen.
- **Gewenst:** compacte tool-result-samenvattingen + plan-state in de history-reconstructie; slimmer venster dan "laatste 20".

## E6 — (optioneel) apply_patch zonder client-patching (D-ENGINE)
- **Nu:** de engine stuurt een unified diff; de IDE past 'm toe (nu strikt-falend, commit bea294a).
- **Gewenst (discussie):** engine stuurt volledige file-content of anchored edits → client-patching verdwijnt volledig; de engine's eigen post-merge verify (PR-5, agent_loop `_read_merged`) blijft het vangnet.

## Volgorde-advies
E2 (kleinste, directe kwaliteitswinst voor elke chat) → E1 (haalt de prompt-prefix weg) → E3 (exacte attributie) → E5 → E4 → E6.
