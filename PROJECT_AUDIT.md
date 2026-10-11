# Project audit

Audit date: 2026-10-11. Based on the checked-in repository and current implementation.

## Starting point

The repository began as a Vite starter UI plus one FastAPI module. Clothing was held in a Python sample list, uploaded files were served as unauthenticated static files, and the frontend had a prompt-driven upload plus a wardrobe list. There was no account system, persistent database, outfit workflow, AI integration, test suite, or project audit/roadmap/status documentation. The git working tree was clean before this implementation.

## Current architecture

- `frontend/`: React/Vite single-page app. `src/App.jsx` owns the current auth and view state and calls the API; `App.css` and `index.css` implement the responsive design.
- `backend/app/main.py`: FastAPI routes, Pydantic request validation, PBKDF2 auth, SQLite repositories/queries, image validation/storage, Ollama analysis, and outfit scoring. This is intentionally compact, but it should be split into modules as the API grows.
- `backend/data/wardrobe.sqlite3`: persistent local SQLite database, initialized at API startup.
- `backend/uploads/`: random-named private image files. Image route verifies the signed-in owner before returning a file.
- `backend/tests/test_api.py`: isolated API integration checks using temporary SQLite and uploads.

## Implemented

- Persistent user, session, clothing, preference, outfit, outfit-item, and feedback tables, with foreign keys and an owner index.
- Account registration/login/logout, salted PBKDF2 password hashes, hash-only session persistence, account deletion, and user scoping on records.
- Image upload/replacement/deletion with MIME and signature checks, maximum size, UUID filenames, per-owner protected reads, and cleanup on failed persistence or CRUD deletion. Optional AI analysis now falls back to manual metadata.
- Clothing listing/search/filtering, detail, updates, favorites, favorites filter, wear count, export.
- Optional local Ollama vision analysis with structured JSON parsing, allowlisted attributes, and stored provider provenance. Manual entry remains available.
- Saved outfits and explanations, occasion input, style preference support, feedback-informed recommendation score, and responsive UI states.
- Authenticated image retrieval from bearer-enabled `fetch`, normalized `VITE_API_BASE_URL` path handling, revocable blob URLs, loading/broken/missing fallbacks, and image alt text. Private image endpoints remain owner-scoped.
- Additive SQLite schema updates for expanded personal preferences, outfit description/notes/style/season/favorite/update/provenance, and item-pair feedback signatures; existing account, clothing, and outfit records are retained.
- Functional Style Profile and manual Outfit Builder pages. Outfit APIs now retrieve and update owner-scoped outfits, deduplicate item references, allow a one-piece outfit, and validate every selected item against the authenticated owner. Saved outfits can be edited, duplicated, favorited, or deleted.
- Deterministic recommendation scoring now uses preferred/avoided colors, preferred styles/occasions/seasons, available formality metadata, variety, wear counts, and recorded disliked pairs when requested.
- README setup and privacy/deployment notes, plus project status documents.

## Known gaps and risks

- Auth is suitable for local MVP use, not production: no email verification, password reset, rate limiting, lockout, CSRF token strategy for cookie-only mutation requests, or session expiry/management UI. Keep the service on localhost.
- SQLite transactions are used directly in the API module. Schema evolution currently uses idempotent `CREATE TABLE IF NOT EXISTS`, not versioned migrations.
- AI confidence is not supplied by the current Ollama response and is stored as null. The vision output may be wrong and needs user correction. There is no model-specific structured schema enforcement beyond JSON parsing and an attribute allowlist.
- Recommendation scoring is transparent and intentionally lightweight; weather, season context, multi-piece layering logic, and robust learned personalization are not implemented.
- Saved outfit history is present; a distinct event-level wear history, insights, and recommendation history UI are not yet implemented.
- Uploads are capped at 8 MB but are not resized or stripped of metadata. No image malware scanning or encryption at rest.
- The UI currently provides an account name/email from registration but no dedicated profile editor, and no pagination beyond a 200-item API cap.
- Fit, layering, rain and warm/cold weather controls persist but cannot affect scoring until corresponding clothing/weather data exists. Preferred fit is never inferred from body measurements.
- Profile customization and outfit composition have been smoke-checked in the browser with test images. Real Ollama inference, image replacement through the browser, and mobile viewport behavior remain unverified.
- Production deployment, cloud storage/database, rate limiting, observability, and a privacy/legal review remain out of scope.
- External Google Fonts are used as an enhancement; a system font fallback is present if unavailable.

## Initial subsystem estimate

Estimates are maturity for a local MVP, not production completeness.

| Area | At audit start | Current |
|---|---:|---:|
| Frontend | 10% | 70% |
| Backend | 15% | 75% |
| Database | 0% | 65% |
| AI | 0% | 45% |
| Authentication | 0% | 55% |
| Recommendation engine | 0% | 50% |
| Personalization | 0% | 35% |
| Testing | 0% | 45% |
| Deployment | 0% | 20% |

## Image display investigation and verification (2026-10-11)

The `/uploads/{filename}` API requires an authenticated owner session. Earlier wardrobe, recommendation, detail, and saved-outfit views rendered the private path directly in `<img>` tags; native image tags cannot attach the app's custom bearer header. Those requests depended on the HTTP-only cookie. The documented defaults use `localhost` for Vite and `127.0.0.1` for the API, which can make the cookie cross-site under `SameSite=Lax`. That combination explains the missing photos. The UI now fetches those references using the current bearer token, only attaches it to the configured API origin, and displays the bytes from a revocable object URL. URL construction accepts relative API paths and absolute API references and respects `VITE_API_BASE_URL` plus the previous `VITE_API_URL` alias.

The 2026-10-11 manual smoke used an isolated SQLite file and isolated upload folder. It verified signup, three authenticated image uploads/renderings, profile save and reload, one-piece outfit creation, outfit item replacement and update, duplication/deletion, recommendation customization/save, logout/login, and image/session persistence after a real API restart. The original project data directories were not used. Ten automated backend tests and six frontend tests also pass; real Ollama inference was not configured.

