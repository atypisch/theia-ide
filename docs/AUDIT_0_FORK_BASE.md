# AUDIT 0.2 — Fork Base

**Date:** 2026-06-08  
**Status:** READ-ONLY audit artifact

---

## Upstream identity

| Field | Value |
|-------|-------|
| **Upstream repository** | [eclipse-theia/theia-ide](https://github.com/eclipse-theia/theia-ide) |
| **Upstream branch** | `master` |
| **Upstream remote** | `upstream` → `https://github.com/eclipse-theia/theia-ide.git` |
| **Origin remote** | `origin` → `https://github.com/atypisch/theia-ide.git` |

`origin/master` and `upstream/master` are **identical** at audit time — `atypisch/theia-ide` is a mirror with zero committed divergence.

---

## Fork point (HEAD)

| Field | Value |
|-------|-------|
| **HEAD commit** | `aa79d48c402715889abb64b98a63deeef5dd621f` |
| **Commit message** | *Add @theia/ai-registry package* |
| **Commit date** | 2026-06-01 11:50:41 +0200 |
| **Git describe** | `next` |
| **Merge-base** (`HEAD` ∩ `upstream/master`) | `aa79d48` (same as HEAD) |

### Recent upstream history (for version context)

| Commit | Message |
|--------|---------|
| `aa79d48` | Add @theia/ai-registry package |
| `562981a` | Update yauzl resolution |
| `4a68447` | **Update to Theia v1.72.1** |
| `777875b` | chore: update theiaPlugins |
| `7e69ba2` | feat: switch from webpack to esbuild bundling |

---

## Commits ahead of upstream

| Range | Count |
|-------|-------|
| `upstream/master..HEAD` | **0** (committed) |
| `HEAD..upstream/master` | **0** |

**All Soriku customization at audit time lives in the uncommitted working tree** (branding, `soriku-engine-client`, docs, icons). No Soriku commits exist on any branch yet.

---

## Theia version pins

| Location | Version |
|----------|---------|
| `lerna.json` | `1.72.100` |
| `applications/browser/package.json` → `@theia/*` | `1.73.0-next.2` |
| `applications/electron/package.json` → `@theia/*` | `1.73.0-next.2` |
| `applications/electron-next/package.json` → `@theia/*` | `1.73.0-next.2` |
| `theia-extensions/product/package.json` → `@theia/*` | `1.73.0-next.2` |
| `yarn.lock` resolved `@theia/core` | `1.73.0-next.2+8ed51a5e94d` |

The upstream theia-ide repo consumes Theia framework packages from **npm**, not from a sibling `theia/` monorepo. Optional local linking is documented in `docs/developing-with-local-theia.md` but is not in use.

---

## Framework fork status

| Question | Answer |
|----------|--------|
| Is `packages/core/` present? | **No** |
| Are `@theia/core` sources edited in-repo? | **No** |
| Is there a `patches/@theia+core*` file? | **No** |
| Existing patch-package patches | **1** — `@theia+terminal+1.72.1.patch` (Electron asar path fix) |

---

## Architecture classification

This repo is a **Theia IDE product adopter** (Eclipse's recommended pattern per `ADOPTER.md`), not a **Theia framework fork** (`eclipse-theia/theia`).

Implication for the de-fork template: Phase 1.1 ("replace `packages/<theia-pkg>` with npm deps") is **already satisfied**. Remaining architectural work is **AI-layer replacement** (`@theia/ai-*` → `@soriku/*` extensions) and **branding consolidation**, not core de-forking.
