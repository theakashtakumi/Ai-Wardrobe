# Project audit

Audit date: 2026-10-11. Based on the checked-in repository and current implementation.

## Starting point

The repository began as a Vite starter UI plus one FastAPI module. Clothing was held in a Python sample list, uploaded files were served as unauthenticated static files, and the frontend had a prompt-driven upload plus a wardrobe list. There was no account system, persistent database, outfit workflow, AI integration, test suite, or project audit/roadmap/status documentation. The git working tree was clean before this implementation.

## Current architecture

- `frontend/`: React/Vite single-page app. `src/App.jsx` owns the current auth and view state and calls the API; `App.css` and `index.css` implement the responsive design.
- `backend/app/main.py`: FastAPI routes, Pydantic request validation, PBKDF2 auth, SQLite repositories/queries, image validation/storage, Ollama analysis, configurable Open-Meteo weather lookups, and outfit scoring. This is intentionally compact, but it should be split into modules as the API grows.
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
- Event-level wear history stores dated item snapshots, supports CRUD/idempotency and date-filtered insights, synchronizes legacy wear counters, and reduces recommendation scores for recently worn items/pairs. Existing outfit snapshots remain after clothing deletion.
- Optional weather context supports manual conditions without provider configuration and Open-Meteo city/current-weather requests when explicitly enabled. Scoring can favor known cold layers/season tags and explain rain context without asserting unknown waterproofing or breathability. Incomplete garment metadata does not exclude outfits.
- `/ai/status` checks configured Ollama model availability; analysis has a bounded timeout, response allowlisting/normalization, sanitized logs, and manual-entry fallback. Generated values are stored separately in `ai_attributes`; entered name/category/color take priority.
- README setup and privacy/deployment notes, plus project status documents.

## Known gaps and risks

- Auth is suitable for local MVP use, not production: no email verification, password reset, rate limiting, lockout, CSRF token strategy for cookie-only mutation requests, or session expiry/management UI. Keep the service on localhost.
- SQLite transactions are used directly in the API module. Schema evolution currently uses idempotent `CREATE TABLE IF NOT EXISTS`, not versioned migrations.
- AI confidence is not supplied by the current Ollama response and is stored as null. The vision output may be wrong and needs user correction. There is no model-specific structured schema enforcement beyond JSON parsing and an attribute allowlist.
- Recommendation scoring is transparent and intentionally lightweight. Weather logic is rule-based; it does not infer waterproofing, fabric breathability, or precise garment warmth, and it has no learned model or ranking evaluation dataset.
- Weather lookup requires `WEATHER_PROVIDER=open-meteo` and external network access. Open-Meteo's public free endpoint is for noncommercial use; commercial use requires a paid customer endpoint/key. In-app Open-Meteo attribution links to the provider and CC BY 4.0.
- Uploads are capped at 8 MB but are not resized or stripped of metadata. No image malware scanning or encryption at rest.
- The UI currently provides an account name/email from registration but no dedicated profile editor, and no pagination beyond a 200-item API cap.
- Fit preference is persisted but is not currently scored because clothing fit metadata is not collected. Layering/rain/cold/warm controls influence only where actual weather and available garment metadata permit; no properties are invented.
- Automated tests cover auth, user isolation, image upload/privacy, CRUD, persistence, outfits, feedback, wear history, weather validation/provider behavior and scoring, and Ollama payload parsing/fallback. Current frontend lint, 8 frontend tests, build, syntax checks, and 19 backend tests pass (2026-10-11). Tests mock provider HTTP; they are not live-provider or real-model inference tests.
- Earlier browser smoke testing on 2026-10-11 covered signup, image upload/rendering, profile save/reload, outfit builder/edit/duplicate/delete, recommendation customization, logout/login, and a real isolated API restart. The newest weather-panel and AI-status UI were not browser-tested. Real Ollama inference and narrow-mobile browser behavior remain unverified.
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

The 2026-10-11 manual smoke used an isolated SQLite file and isolated upload folder. It verified signup, three authenticated image uploads/renderings, profile save and reload, one-piece outfit creation, outfit item replacement and update, duplication/deletion, recommendation customization/save, logout/login, and image/session persistence after a real API restart. The original project data directories were not used. This prior browser session did not include the later weather panel or AI-status indicator. The current automated results are recorded in `PROJECT_STATUS.md`; live Open-Meteo and real Ollama were not invoked.

