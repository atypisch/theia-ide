# DEFORK 0 — Starting State Snapshot

**Date:** 2026-06-08
**Safety tag:** `pre-defork-2026-06-08` (pushed to `origin`)
**Working branch:** `defork/option-c` (created off the tagged commit; `master` untouched)

This snapshot records the known-good baseline *before* the Optie C de-fork, so any regression
introduced by stripping `@theia/ai-*` can be detected against it.

## Repository facts

- **No forked Theia core.** All `@theia/*` packages are npm dependencies at `1.73.0-next.2`
  (confirmed in `docs/AUDIT_0_FORK_BASE.md`). This repo is a *theia-ide adopter*, not a framework fork.
- **Apps (3):** `applications/browser`, `applications/electron`, `applications/electron-next` —
  each currently depends on **24** `@theia/ai-*` packages (to be removed in Phase 1).
- **Local extensions:** `theia-extensions/{product, launcher, updater, soriku-engine-client}`.
- **Engine client present:** `theia-extensions/soriku-engine-client` (committed baseline,
  `soriku-engine-client-ext@0.1.0`), wired as a dependency of the browser and electron apps.
  Default engine URL `http://127.0.0.1:8765`.
- **Only patch:** `patches/@theia+terminal+1.72.1.patch` (asar → asar.unpacked path fix), applied
  via `patch-package` in the root `postinstall`.

## Baseline commits on this branch (tagged)

```
f49e0cf [P0] Apply Soriku IDE branding and wire engine-client into apps
791a60a [P0] Add soriku-engine-client extension (HTTP/SSE engine client)
10076e7 [P0] Add fork audit and Phase 0-2 inventory docs
aa79d48 Add @theia/ai-registry package   <- last upstream/atypisch commit
```

Untracked and intentionally left out of the baseline: `.htaccess`, `get-pip.py`.

## Build / start / test commands

| Action | Command (from repo root unless noted) |
|--------|----------------------------------------|
| Install | `yarn` (runs `theia-patch` + `patch-package` in postinstall) |
| Build extensions | `yarn build:extensions` |
| Build all (prod) | `yarn build` |
| Build all (dev) | `yarn build:dev` |
| Start browser app | `yarn --cwd applications/browser start` (`theia start --plugins=local-dir:../../plugins`) |
| Start electron app | `yarn --cwd applications/electron start` |
| Run all tests | `yarn test` (`lerna run test`) |
| Engine-client tests | `yarn --cwd theia-extensions/soriku-engine-client test` |
| Smoke test | `scripts/smoke-test.sh` |

## What works (per audit, `docs/PHASE_1_RESULT.md`)

- Monorepo restored (yarn workspaces + lerna), branding applied.
- Smoke test passing 3× in the audit run.
- `soriku-engine-client` transport + preferences in place, `node:test` specs green.
- IDE boots with upstream Theia infrastructure **plus** the full `@theia/ai-*` AI stack still present.

## What does not work yet / out of scope at baseline

- No `@soriku/*` AI features (agents panel, chat, tools-bridge, etc.) — those are Phase 2.
- `@theia/ai-*` provider stack is still installed and active (to be stripped in Phase 1).
- `theia-extensions/product` is still hard-coupled to `@theia/ai-registry` (decoupled in Phase 1.3).

## Verification note

Boot + smoke test were last verified in the audit (`docs/PHASE_1_RESULT.md`). A full build was **not**
re-run in this Phase 0 session — Phase 0 is git-safety only. The authoritative boot verification for the
de-forked state happens at **STOP-CHECKPOINT 1** (Phase 1.6), after `@theia/ai-*` is removed.
