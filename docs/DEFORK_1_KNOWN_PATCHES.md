# DEFORK 1 — Known Patches

**Date:** 2026-06-08 · Branch `defork/option-c`

Patches are applied via `patch-package` in the root `postinstall`
(`theia-patch && npx patch-package --patch-dir patches`). Two patches apply on install.

## 1. `patches/@theia+terminal+1.72.1.patch` (Soriku-tracked, keep)

- **What it does:** rewrites the shell-integration script path so the terminal works inside an
  Electron `asar` bundle. Single-line change in
  `@theia/terminal/.../shell-integration-injector.js`:
  ```
  -return fullPath;
  +return fullPath.replace('.asar' + path.sep, '.asar.unpacked' + path.sep);
  ```
- **Why it's needed:** standard Electron adopter packaging issue — the script ships unpacked
  (`.asar.unpacked`) but the resolved path points inside `.asar`. Not a Soriku feature; pure packaging
  fix. This is the **only patch allowed by non-negotiable rule #2**.
- **Version-mismatch warning:** the patch file is named `@theia+terminal+1.72.1` but applies to the
  installed `@theia/terminal@1.73.0-next.2`. patch-package reports:
  `Patch file created for @theia/terminal@1.72.1 applied to @theia/terminal@1.73.0-next.2 … applied
  successfully`. The patch **does apply cleanly**; the warning is cosmetic (filename version lag).
  - *Optional cleanup:* run `npx patch-package @theia/terminal` to regenerate the file as
    `@theia+terminal+1.73.0-next.2.patch` and silence the warning. Deferred — not required for boot.
- **When removable:** once upstream Theia resolves the asar shell-integration path internally. No open
  Theia issue tracked yet; if kept long-term, open one. Re-check on each Theia bump (see
  `DEFORK_5_UPSTREAM_STRATEGY.md`).

## 2. `@lumino/widgets@2.7.5` (upstream theia-ide patch, not in `patches/`)

- A second `patch-package` pass reports `@lumino/widgets@2.7.5 ✔`. This patch is **not** in the local
  `patches/` directory — it is applied by the upstream `theia-patch` step (Theia's own bundled
  adopter patch for `@lumino/widgets`). Inherited from upstream theia-ide, not Soriku-introduced.
- **Action:** none. Leave as upstream behavior; document only.

## Summary

| Patch | Source | Status | Allowed by rule #2 |
|-------|--------|--------|--------------------|
| `@theia/terminal` asar fix | `patches/` (Soriku-tracked) | applies (cosmetic version warning) | ✅ explicit exception |
| `@lumino/widgets` | upstream `theia-patch` | applies | ✅ upstream, not a Soriku core patch |

No Soriku-authored Theia source patches exist beyond the terminal asar fix.
