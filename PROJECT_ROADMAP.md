# Project roadmap

Updated 2026-10-11.

## MVP milestones

| Milestone | State | Notes / next step |
|---|---|---|
| Audit and stabilize | Verified for local MVP | Frontend lint/tests/build, 10 isolated backend integration tests, manual browser smoke flow, and a live API restart check pass. |
| Persistence and wardrobe CRUD | Complete for local MVP | SQLite and private local uploads; add versioned migrations before schema changes grow. |
| Accounts and data isolation | Implemented, needs hardening | Hashed passwords, token sessions, scoped data. Add rate limiting, recovery, CSRF strategy, and session management before hosting. |
| AI clothing analysis | Implemented behind local setup | Ollama vision; install/pull a model and configure `OLLAMA_MODEL`. Add confidence/evaluation and richer editing UX. |
| Wardrobe experience | Core complete | CRUD, search, common category filters, favorite and detail editing. Add pagination, bulk actions, and more metadata filters. |
| Outfit builder and saved outfits | Core complete | Manual wardrobe selection, one-piece outfits, edit, duplicate, favorite, delete, and recommendation-to-builder are implemented. Drag-and-drop is optional polish. |
| Recommendations | MVP complete | Explainable palette/category/occasion/style/feedback score. Improve candidate diversity and evaluation. |
| Context and personalization | Partial | Style/color/occasion/season/formality/variety scoring and disliked-pair feedback are included. Fit, layering, and weather preferences persist but need matching wardrobe/weather metadata to affect scores. |
| History and insights | Partial | Wear count/date stored; saved outfit list exists. Add wear event history and useful insights UI. |
| UX, security, reliability | Local MVP complete | Responsive views and errors. Add accessibility audit, image optimization, rate limits, and production security review. |
| Automated QA | Initial coverage, core workflows smoke-checked | 10 isolated API integration tests, 6 frontend utility tests, lint/build, and browser smoke coverage. Real model inference and mobile browser interaction remain unverified. |
| Deployment preparation | Documentation only | Requires persistent hosted database/object storage, HTTPS, secrets, migration process, monitoring, and provider choice. |

## Prioritized next actions

1. Verify photo replacement and the new profile/builder pages at a narrow mobile viewport in a browser.
2. Configure Ollama and verify output with an actual local vision model, while retaining the tested manual fallback when it is unavailable.
3. Add clothing fit/layering/weather metadata and use those fields to activate more profile controls; add event-level wear history.
4. Add schema migration versioning before more schema changes grow, then split `backend/app/main.py` into config, database, models/schemas, routes, and services.
5. Before public deployment, add abuse protection, password recovery, CSRF policy, image optimization/scanning, backups, and hosted storage.

## Current blockers

- No AI model is bundled or configured. The user must install Ollama and pull a vision model to use automatic analysis.
- Real Ollama inference, image replacement in a browser, and mobile viewport behavior are not yet verified manually.
- No production provider or hosted services have been selected or configured.
