# AUDIT 4 — Recommendation

**Date:** 2026-06-08  
**Based on:** [`AUDIT_3_SUMMARY.md`](AUDIT_3_SUMMARY.md)

---

## Position: **B — Optie C is de juiste architectuur**

Soriku IDE should **not** fork Theia core (it already does not), should **not** build on `@theia/ai-*`, and should **replace the AI layer** with `@soriku/*` peer extensions on top of upstream Theia infrastructure.

---

## Why not A (fork rechtvaardigt zichzelf)

Recommendation A requires ≥3 features with real PATCH on `@theia/core` / `@theia/editor` / `@theia/monaco` that cannot use extension hooks.

**Finding:** **0 feature-driven PATCHes.** The only patch is `@theia/terminal` asar path fix — standard Electron packaging, not a Soriku feature requirement.

There is no `packages/core/` directory. No committed divergence from upstream. A core fork would **create** maintenance burden without solving any blocked feature.

---

## Why not C (volledig additief via @theia/ai-*)

Recommendation C requires no feature to need PATCH or PEER — everything via ADDITIVE/REBIND on Theia AI.

**Finding:** Pad 1 scores **8 REBIND + 1 PEER** across 15 features. The REBIND features are not edge cases — they are **Soriku's core value**:

| Soriku capability | Theia AI gap (source) |
|-------------------|----------------------|
| SmartRouter / capability-map routing | `LanguageModelRegistry.selectLanguageModel()` selects by agent+purpose, not benchmark scores (`ai-core/lib/common/language-model.d.ts:374`) |
| Conductor + Workers | `Agent` has no Plan/Task/Worker types (`ai-core/lib/common/agent.d.ts:23-49`) |
| Multi-model synthesis | `LanguageModel.request()` is 1:1 (`language-model.d.ts:344`); no verify/ensemble |
| Engine-owned BYOK | Provider packages (`ai-openai`, etc.) manage keys client-side — conflicts with engine `/api/providers` |
| SSE chat with routing transparency | `ChatAgent.invoke()` expects Theia stream format (`ai-chat/lib/common/chat-agents.d.ts:61`), not engine SSE events |

Pad 1 is technically possible via adapter layers (REBIND), but it means **fighting Theia AI's provider-centric model** while carrying 23 unused AI packages. That is worse than PEER replacement.

---

## Why B (Optie C / peer-packages)

| Evidence | Detail |
|----------|--------|
| No core fork needed | Repo is already theia-ide adopter with npm deps |
| 0 PATCH features | All infrastructure features use `ViewContribution`, `PreferenceContribution`, injectable services |
| AI layer mismatch | Soriku engine is headless orchestration; Theia AI is IDE-embedded provider framework |
| Work already started | `theia-extensions/soriku-engine-client/` implements `EngineClient` with preferences + SSE |
| Engine contract ready | `docs/PHASE_2_ENGINE_CONTRACT.md` maps all IDE methods |
| Pad 2 scores | 0 REBIND, 0 PATCH, 7 ADDITIVE + 8 PEER (AI replacement, not source edit) |

**Optie C definition (from audit prompt):** upstream Theia infrastructure + own `@soriku/*` peer packages replacing `@theia/ai-*`. This matches the evidence.

---

## Pad comparison table

| Feature | Pad1 strictest | Pad2 strictest | Winner |
|---------|---------------|---------------|--------|
| SmartRouter | REBIND | PEER+ADD | Pad2 |
| Conductor+Workers | REBIND | PEER+ADD | Pad2 |
| Pilot mode | REBIND | PEER+ADD | Pad2 |
| Training/feedback | REBIND | PEER+ADD | Pad2 |
| BYOK | PEER | PEER+ADD | Pad2 |
| Capability map | ADDITIVE | ADDITIVE | Tie |
| Synthesis modes | REBIND | PEER+ADD | Pad2 |
| Persona marketplace | ADDITIVE | ADDITIVE | Tie |
| Agent chat | REBIND | PEER+ADD | Pad2 |
| Tool bridge | ADDITIVE | ADDITIVE | Tie |
| Routing overrides | ADDITIVE | ADDITIVE | Tie |
| Auth | REBIND | ADDITIVE | Pad2 |
| Benchmark | ADDITIVE | ADDITIVE | Tie |
| Engine URL | ADDITIVE | ADDITIVE | Tie (done) |
| RAG (future) | REBIND | ADD+PEER | Pad2 |

**Pad2 wins or ties on all 15 features.** Pad1 wins on 0.

---

## De-fork template mapping

The attached de-fork template assumes a core-fork with `packages/`. Mapping to actual repo state:

| Template phase | Status | Action |
|----------------|--------|--------|
| **Phase 0** Safety tag + branch | Recommended before AI-deps strip | `git tag pre-defork-2026-06-08`; branch `defork/option-c` |
| **Phase 1.1** Replace `packages/` with npm | **SKIP** — already done | No `packages/` exists |
| **Phase 1.2** Remove `@theia/ai-*` | **ACTUEEL** | Strip 23 AI packages from app `package.json` files |
| **Phase 1.3** Re-install + verify build | **ACTUEEL** | `yarn install && yarn build:dev` — IDE starts without AI features |
| **Phase 2** Build `@soriku/*` packages | **IN PROGRESS** | `soriku-engine-client` done; next: agents-panel, chat, tools-bridge, auth |
| **Phase 3** PATCH features | **SKIP** (empty) | Only terminal asar patch remains |
| **Phase 4** Branding | **PARTIALLY DONE** | Uncommitted branding in `product` + `applications/` |
| **Phase 5** Cleanup + validation | **FUTURE** | After extensions wired |
| **Phase 6** Merge to main | **FUTURE** | After Marten approval |

---

## Concrete next steps (if Marten confirms B)

1. **Tag + branch** — `pre-defork-2026-06-08` on current state; work on `defork/option-c`
2. **Commit existing Soriku work** — branding, `soriku-engine-client`, docs (currently uncommitted)
3. **Strip `@theia/ai-*`** from `applications/browser`, `electron`, `electron-next` dependencies
4. **Remove** `theia-extensions/product` → `@theia/ai-registry` binding
5. **Verify** IDE builds and starts (no AI panels — expected interim state)
6. **Continue Phase 2 bootstrap** — `soriku-agents-panel` → `soriku-chat` → `soriku-tools-bridge` → `soriku-auth`
7. **Document** monthly upstream merge rhythm in `docs/DEFORK_5_UPSTREAM_STRATEGY.md` (during de-fork execution)
8. **Keep** `patches/@theia+terminal+1.72.1.patch` until upstream provides asar-safe path resolution

---

## Upstream merge strategy (preview)

| Item | Recommendation |
|------|----------------|
| Cadence | Monthly merge from `eclipse-theia/theia-ide` `master` |
| Conflict risk | Low — Soriku changes are in `theia-extensions/soriku-*` and `product`, not in framework source |
| Version pin | Track `1.73.0-next.2` channel until stable `1.73.x` release, then align |
| Terminal patch | Regenerate patch filename when `@theia/terminal` version changes |
| AI packages | Do not re-add — upstream theia-ide will keep adding AI packages; explicitly exclude in merge |

---

## STOP-CHECKPOINT FINAL

All audit artifacts:

| Document | Purpose |
|----------|---------|
| [`AUDIT_0_PATHS.md`](AUDIT_0_PATHS.md) | Repo paths |
| [`AUDIT_0_FORK_BASE.md`](AUDIT_0_FORK_BASE.md) | Fork baseline |
| [`AUDIT_0_FORK_DIFF.patch`](AUDIT_0_FORK_DIFF.patch) | Working tree diff vs upstream |
| [`AUDIT_0_FORK_DIFF_SUMMARY.md`](AUDIT_0_FORK_DIFF_SUMMARY.md) | Diff statistics |
| [`AUDIT_1_FEATURES.md`](AUDIT_1_FEATURES.md) | Feature inventory |
| [`AUDIT_2_FEATURE_MATRIX.md`](AUDIT_2_FEATURE_MATRIX.md) | Per-feature classification |
| [`AUDIT_3_SUMMARY.md`](AUDIT_3_SUMMARY.md) | Aggregation |
| [`AUDIT_4_RECOMMENDATION.md`](AUDIT_4_RECOMMENDATION.md) | This document |

**Awaiting Marten's decision before any code changes.**

| Choice | Vervolg |
|--------|---------|
| **A** | Upstream-merge + divergentie-management prompt |
| **B** | De-fork uitvoering (ai-deps strip + `@soriku/*` uitbouwen) |
| **C** | De-fork + Theia AI integratie via providers/agents |
