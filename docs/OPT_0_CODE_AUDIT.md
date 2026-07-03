# OPT Phase 0.4 — Code-kwaliteit audit (IDE codebase)

**Date:** 2026-06-30 · Source: read-only audit of the `soriku-*` extension code itself (not the code the engine generates — that is out of scope, see the master prompt's "kritisch onderscheid").

## Summary: hygiene is already strong

The mechanical quality signals the master prompt worries about are essentially clean already, so Phase-4 can focus on **architecture and comments**, not lint-style cleanup.

| Signal | Count | Verdict |
|--------|------:|---------|
| `: any` / `as any` / `any[]` in signatures | **0** | clean (word "any" appears 11× in comments/prose only) |
| Empty / bare / comment-only `catch` blocks | **0** (of 82 catches) | clean — no swallowed exceptions |
| Hardcoded model names in runtime logic | **0** | 24 hits in `*.spec.ts` fixtures + 2 in JSDoc examples (`soriku-models/src/common/models-view.ts:60`) — passes the rule |
| TODO / FIXME / HACK / XXX | **0** | clean |

## Architecture smells (Phase-4 candidates)

- **God-widget:** `soriku-chat/src/browser/soriku-chat-widget.tsx` — **1163 LOC**. Mixes stream lifecycle, tool-approval orchestration, external-plan ingestion, rendering, and state. This is also where blockers #2/#17 and minors #15/#16 live. Decompose: extract a testable stream-lifecycle controller to `common/` (needed anyway for the #2 fix), split rendering from orchestration.
- **Large reducer:** `soriku-chat/src/common/chat-model.ts` — **658 LOC**. Central SSE-event reducer; home of #3/#7/#8/#15. Candidate to split per-concern (turn state vs tool-call correlation vs fleet/agents).
- **Types hub:** `soriku-engine-client/src/common/engine-types.ts` — 530 LOC; acceptable for a contract file, but worth sectioning.
- **Reimplemented engine logic:** `soriku-tools-bridge/src/common/tool-delegation.ts` reimplements engine tool-output formatting + a hand-rolled unified-patch applier — a correctness *and* a duplication smell (see context-audit C-D). Consolidate toward the engine contract.

## Theia-API usage

- **Dependency graph is a clean DAG** (see inventory) — no layering inversion at the package level.
- **Disposable hygiene is the weak spot** (not "smells" but real leaks): abortController/rAF/timers/EventSource/provider-Disposables not consistently tracked in `DisposableCollection` (#2, #17, #18, #19, #20). This is a cross-cutting Phase-1 correctness theme, re-verified in Phase-3 as a flat memory curve.
- **Layer responsibility violation:** the widget (view layer) performs tool-approval orchestration and external-plan reduction — belongs in a service. Aligns with the #2 extraction.

## Error-handling consistency

- No empty catches, but error *typing* is thin: transport-malformed vs engine vs auth errors are conflated (#3, #14). Phase-1 introduces typed error classes (`transport_error`, `auth_required`) — this doubles as the code-audit remedy.

## Comments

Density is reasonable but the highest-complexity zones (parallel-stream reduction in `chat-model.ts`, stream lifecycle in the widget) lack *why*-comments for their state transitions. Phase-4: add architecture comments where #7/#8 correlation and #2/#3 lifecycle logic live — after the behaviour is fixed, so comments describe the corrected model.

## Conclusion

No standalone "code-quality cleanup" phase is warranted (hygiene is clean). The code-quality work folds into: **Phase 1** (disposable hygiene, typed errors) and **Phase 4** (decompose the two large files, add why-comments to the corrected hot paths). No `any`/catch/model-name remediation needed.
