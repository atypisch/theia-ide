# AUDIT 0.3 — Fork Diff Summary

**Date:** 2026-06-08  
**Baseline:** `upstream/master` @ `aa79d48`  
**Patch file:** [`AUDIT_0_FORK_DIFF.patch`](AUDIT_0_FORK_DIFF.patch)

---

## Executive summary

**There is no Theia core fork.** `HEAD` is identical to `upstream/master` (0 committed divergence). All Soriku work is **uncommitted** in the working tree: branding, a new `soriku-engine-client` extension, and docs.

The audit prompt's `packages/core/*` grouping does not apply. Changes are confined to **theia-ide product zones** and one **packaging patch** on `@theia/terminal`.

---

## Layer A — Committed diff (`upstream/master..HEAD`)

Filtered: `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.css`

| Metric | Value |
|--------|-------|
| Files changed | **0** |
| Lines added | **0** |
| Lines removed | **0** |

`origin/master` = `upstream/master` = `HEAD`. No Soriku commits exist.

---

## Layer B — Effective Soriku divergence (working tree vs `HEAD`)

### B.1 Text files in diff scope

Command: `git diff HEAD -- '*.ts' '*.tsx' '*.js' '*.json' '*.css'`

| Zone | Files | +Lines | −Lines | Nature |
|------|-------|--------|--------|--------|
| `applications/browser/` | 1 | 6 | 5 | Soriku branding (`applicationName`, `productName`, `configurationFolder`) |
| `applications/electron/` | 1 | 5 | 4 | Soriku branding + electron config |
| Root `package.json` | 1 | 1 | 1 | `build:extensions` scope adds `soriku-*` |
| `theia-extensions/product/` | 5 | 19 | 20 | Branding copy, registry tool name `soriku-ide` |
| **Subtotal (modified)** | **8** | **31** | **30** |

### B.2 Untracked text (new Soriku code)

| Zone | Files | ~Lines | Nature |
|------|-------|--------|--------|
| `theia-extensions/soriku-engine-client/` | 18 (`.ts` + `.json`) | ~1,193 | `EngineClient`, HTTP/SSE transport, preferences, tests |
| `docs/PHASE_*.md` | 4 | — | Prior bootstrap docs (not audit output) |
| `scripts/smoke-test.sh` | 1 | — | Smoke test script |
| `.htaccess` | 1 | — | Apache reverse-proxy (local dev) |

### B.3 Binary / lockfile (outside text diff filter)

| Zone | Files | Nature |
|------|-------|--------|
| `applications/electron/electron-builder.yml` | 1 | `appId`, `productName` → Soriku |
| `applications/electron/resources/` | 4 | Icons, splash SVG |
| `theia-extensions/product/src/browser/icons/` | 4 | Soriku logo PNGs |
| `yarn.lock` | 1 | Dependency lock (engine-client wiring) |

### B.4 Pre-existing patch (committed in upstream, not Soriku-specific)

| File | Target package | Lines | Purpose |
|------|----------------|-------|---------|
| `patches/@theia+terminal+1.72.1.patch` | `@theia/terminal` | 1 changed | Electron asar → `.asar.unpacked` path fix |

Documented in [`ADOPTER.md`](../ADOPTER.md). Applied via `postinstall`: `theia-patch && npx patch-package`.

---

## Grouping by theia-ide zone (not `packages/core`)

| Zone | Modified | New | Core fork? |
|------|----------|-----|------------|
| `applications/*` | 2 JSON | 0 | No — product config only |
| `theia-extensions/product` | 5 TS/JSON | 0 | No — branding extension |
| `theia-extensions/soriku-engine-client` | 0 | 18 TS/JSON | No — additive extension |
| `theia-extensions/updater\|launcher` | 0 | 0 | Unchanged |
| `patches/` | 0 | 0 | 1 upstream packaging patch (pre-existing) |
| `packages/core/*` | — | — | **Directory does not exist** |
| `node_modules/@theia/core` | 0 | 0 | Consumed from npm, never edited |

---

## What is NOT in the diff

- No edits to `@theia/core`, `@theia/editor`, `@theia/monaco`, `@theia/filesystem` source
- No `packages/` directory at all
- No Soriku-specific commits on any branch
- No `@theia/ai-*` dependency removals yet (23 AI packages still in `applications/browser/package.json`)

---

## STOP-CHECKPOINT 0 — Conclusion

| Question | Answer |
|----------|--------|
| Is this a Theia **core** fork? | **No** |
| Is committed divergence significant? | **No** (0 lines) |
| Where does Soriku work live? | `theia-extensions/` + `applications/` branding |
| Does the audit need to be shorter? | Phase 0 de-fork scope is moot; focus shifts to **AI-layer PEER vs @theia/ai-*** (Phases 1–4) |

**Awaiting Marten review before proceeding to Phase 1.**
