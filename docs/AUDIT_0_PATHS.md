# AUDIT 0.1 — Repository Paths

**Date:** 2026-06-08  
**Status:** READ-ONLY audit artifact

---

## Soriku IDE (Theia product repo)

| Field | Value |
|-------|-------|
| **Absolute path** | `/Users/martentiman/Sites/soriku-ide` |
| **Git remote (origin)** | `https://github.com/atypisch/theia-ide.git` |
| **Git remote (upstream)** | `https://github.com/eclipse-theia/theia-ide.git` |
| **Architecture type** | **Theia IDE product adopter** — `applications/` + `theia-extensions/` monorepo |
| **NOT** | `eclipse-theia/theia` framework fork — no `packages/` directory exists |

### Layout zones

```
soriku-ide/
├── applications/browser|electron|electron-next   # Product apps
├── theia-extensions/product|updater|launcher|soriku-engine-client
├── patches/                                        # patch-package (1 file)
├── configs/, scripts/, releng/
└── node_modules/@theia/*                           # Upstream npm packages
```

Theia framework source (`@theia/core`, `@theia/editor`, etc.) is consumed from **npm**, not vendored in-repo.

---

## Soriku engine (Python orchestration repo)

| Field | Value |
|-------|-------|
| **Absolute path** | `/Users/martentiman/Sites/soriku` |
| **Entry point** | `server.py` (FastAPI) |
| **Default bind** | `http://127.0.0.1:8765` |
| **Vision doc** | `/Users/martentiman/Sites/soriku/docs/VISION.md` |

### Key engine modules (for feature verification)

| Module | Role |
|--------|------|
| `server.py` | HTTP/SSE API surface |
| `api/v1/agents.py` | Agent CRUD (v1 envelope) |
| `core/conductor.py` | Conductor orchestration |
| `core/agents/manager.py` | Agent persona management |
| `core/agents/simezu_connector.py` | Simezu / marketplace connector |
| `core/auth/simezu.py` | OAuth / hosted auth |
| `benchmarks/runner.py` | Capability benchmark runner |
| `core/smart_router.py` (via imports) | Smart routing, capability map |

---

## Cross-repo integration

| Transport | Detail |
|-----------|--------|
| Protocol | HTTP + Server-Sent Events (SSE) |
| IDE client | `theia-extensions/soriku-engine-client/` → `EngineClient` service |
| Default URL pref | `soriku.engine.baseUrl` → `http://127.0.0.1:8765` |
| Auth | `soriku.engine.authToken` (Phase 2.5); engine `/api/auth/mode` |

---

## Audit implication

The audit prompt assumes a **Theia-core-fork** with `packages/core/*`. That assumption does **not** apply to this repo. Phase 0 diff analysis uses **theia-ide zones** (`applications/`, `theia-extensions/`, `patches/`) and **npm `@theia/*`** for extension-point verification.
