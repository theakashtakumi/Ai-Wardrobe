# Project roadmap

Updated 2026-10-11 after context-aware styling and stability verification.

## MVP milestones

| Milestone | State | Notes / next step |
|---|---|---|
| Audit and stabilize | Verified by automated tests; prior core browser smoke | Current frontend lint, 8 frontend tests, production build, backend syntax, and 19 isolated backend tests pass. The most recent weather and AI-status UI still needs browser verification. |
| Persistence and wardrobe CRUD | Complete for local MVP | SQLite and private local uploads; add versioned migrations before further schema changes. |
| Accounts and data isolation | Implemented, needs hardening | Hashed passwords, token sessions, owner-scoped data/images. Add rate limiting, recovery, CSRF policy for cookie mutations, and session controls before hosting. |
| AI clothing analysis | Integrated, real inference unverified | Ollama local vision `/api/generate`, bounded timeout, normalization, status check, and manual fallback. Install Ollama and pull a model to perform a real image inference check. |
| Wardrobe experience | Core complete | CRUD, image replace, search, filters, favorites, and authenticated images. Add pagination and bulk actions if needed. |
| Outfit builder and saved outfits | Core complete | Manual wardrobe selection, single-piece outfits, edit, duplicate, favorite, delete, and recommendation-to-builder. |
| Recommendations | MVP complete | Explainable deterministic compatibility, occasion, style, preference, feedback, disliked-pair, variety, and wear-event scoring. |
| Context-aware styling | Implemented, needs UI/live-provider check | Manual and optional Open-Meteo current context. Weather alters scores only for known season/layer metadata and explains missing rain-protection knowledge. No fabric properties are inferred. |
| History and insights | Implemented, automated coverage | Event-level wear records, snapshots, CRUD, idempotency, date filtering/insights, legacy counter synchronization, and recommendation variety effects. |
| UX, security, reliability | Local MVP; production hardening remains | Error states, weather attribution, authenticated images, sanitized provider logs. Accessibility review, backup/restore tooling, and production security review remain. |
| Automated QA | Core API and frontend utilities covered | 19 isolated backend integration tests, 8 frontend utility tests, lint/build. Provider integrations are mocked; real Ollama inference and live weather remain unverified. |
| Deployment preparation | Documentation only | Needs persistent hosted database/object storage, HTTPS/secrets, migrations, abuse protection, monitoring, backups, and a selected provider. |

## Prioritized next actions

1. Browser-verify the updated Outfit Ideas weather panel and AI status in the local app, including manual weather, failed-provider messaging, and recommendation-to-builder-to-wear-history flow.
2. If automatic clothing analysis is wanted, install Ollama and pull `qwen2.5vl:3b`, then verify an actual representative image; preserve the tested manual fallback if the model is unavailable.
3. Consider adding explicit garment insulation, waterproofing, and fit metadata before making weather/fit scoring more specific.
4. Introduce versioned SQLite migrations and backups before expanding the schema; split the single backend module only when the next change benefits from it.
5. Before public deployment, add abuse protection, password recovery, CSRF policy, image scanning/optimization, hosted storage, and operational monitoring.

## Current blockers and constraints

- No Ollama executable/model is installed or configured in the inspected environment. Real inference is not verified. No large model was downloaded.
- Open-Meteo lookup is disabled by default. Its free endpoint is limited to noncommercial use; users need a paid customer endpoint/key for commercial use. Internet lookup is user-triggered; manual context works without it.
- The new weather/AI status interface has not been manually browser-verified in this pass. Previous browser smoke results apply only to the earlier core workflows.
- No production services, credentials, or hosting are configured.
