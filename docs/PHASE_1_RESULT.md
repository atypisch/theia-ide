# Phase 1 — Result

**Status:** Complete (pending Marten confirmation)  
**Architecture:** Monorepo (option B) restored  
**Date:** 2026-06-08

---

## What was delivered

### Monorepo restored
- Root `package.json` + `yarn.lock` reverted to git `HEAD` (lerna + yarn workspaces)
- Standalone root build artifacts removed (`src-gen/`, `lib/`, `esbuild.mjs`, etc.)
- Active dev path is now `yarn browser start` (not root `yarn start`)

### Branding (Phase 1.2)
| Location | Change |
|----------|--------|
| `applications/browser/package.json` | `applicationName` + `productName` → **Soriku IDE**; `configurationFolder` → `.soriku-ide` |
| `applications/electron/package.json` | Same branding + config folder |
| `applications/electron/electron-builder.yml` | `appId: com.atypisch.soriku.ide`, `productName: SorikuIDE` |
| `theia-extensions/product/src/browser/branding-util.tsx` | Product name, about tagline, welcome copy |
| `theia-extensions/product/src/browser/theia-ide-about-dialog.tsx` | About tagline in title block |
| `theia-extensions/product/src/browser/theia-ide-contribution.tsx` | Help menu category → Soriku IDE |
| `theia-extensions/product/src/browser/theia-ide-ai-registry-configuration.ts` | Registry tool name → `soriku-ide` |

About tagline: *"Soriku IDE — built on Eclipse Theia. Powered by the Soriku engine."*

### Icons (Phase 1.3 — placeholders)
Generated from `/Users/martentiman/Sites/soriku/static/soriku_beeldmerk.svg` (same filenames preserved):

- `theia-extensions/product/src/browser/icons/TheiaIDE.png`
- `theia-extensions/product/src/browser/icons/512-512.png`
- `applications/electron/resources/TheiaIDESplash.svg`
- `applications/electron/resources/icons/MacLauncherIcons/icon.icns`
- `applications/electron/resources/icons/WindowIcon/512-512.png`

### Smoke test (Phase 1.4)
- `scripts/smoke-test.sh` — passes 3× consecutively

### Apache proxy
- `.htaccess` proxies `http://localhost/soriku-ide/` → `http://127.0.0.1:3000/`

---

## How to run (Marten)

```sh
cd /Users/martentiman/Sites/soriku-ide
yarn install
yarn build:dev
yarn download:plugins    # if plugins/ is empty
yarn browser start
```

Open:
- Direct: http://127.0.0.1:3000/
- Via MAMP: http://localhost/soriku-ide/

Verify:
```sh
./scripts/smoke-test.sh 3000
```

---

## Intentionally unchanged

- `@theia/core` and all other `@theia/*` packages — **no patches**
- `applications/electron-next` — still "Theia IDE Next" (preview channel, out of scope)
- No `extensions/soriku-*` yet — Phase 2
- Windows `.ico` is a PNG placeholder — replace before Windows release

---

## Next: Phase 2.0

Soriku codebase inventory at `/Users/martentiman/Sites/soriku` — engine contract documentation before any IDE integration.
