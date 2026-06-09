# Phase 1 — Build Log

**Date:** 2026-06-08  
**Target:** Monorepo restored (option B) — `applications/browser` + `theia-extensions/product`

---

## 1.1 Monorepo restore

```sh
cd /Users/martentiman/Sites/soriku-ide
git checkout HEAD -- package.json yarn.lock
rm -rf src-gen lib gen-esbuild.* esbuild.mjs index.html   # standalone artifacts removed
```

## 1.2 First unmodified build (baseline)

| Step | Command | Duration |
|------|---------|----------|
| Install | `yarn install` | ~61s |
| Dev build | `yarn build:dev` | ~45s |

`yarn build:dev` builds extensions + browser app + electron app (lerna scope `theia-ide*app`, ignores `theia-ide-next*`).

**Result:** Success — 0 esbuild errors on browser and electron targets.

### Notable warnings (baseline build)

| Warning | Impact |
|---------|--------|
| `patch-package`: `@theia/terminal@1.72.1` patch applied to `@theia/terminal@1.73.0-next.2` | Low — patch still applied; consider regenerating patch file |
| `npm warn Unknown env config "version-*"` during electron rebuild | Low — npm config noise during native rebuild |
| `[DEP0190] DeprecationWarning` child process shell args | Low — upstream Theia CLI |
| `Module not found: find-git-repositories` during electron rebuild | Informational — optional git helper |

Plugins were already present from prior session (`./plugins/`).

## 1.3 Branded rebuild

After Phase 1.2–1.3 branding changes:

```sh
yarn build:extensions          # ~4s
yarn --cwd applications/browser build   # ~7s
```

**Result:** Success — 0 errors.

## 1.4 Smoke test

```sh
./scripts/smoke-test.sh 3000   # run 3× consecutively
```

| Run | Result |
|-----|--------|
| 1 | PASS |
| 2 | PASS |
| 3 | PASS |

Checks: HTTP 200 on `http://127.0.0.1:3000/`, `<title>Soriku IDE</title>` present.
