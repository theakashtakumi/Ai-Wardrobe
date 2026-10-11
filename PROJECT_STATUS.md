# Project status

Updated 2026-10-11.

## Summary

The repository now contains a functional local-first MVP implementation: React UI, FastAPI API, persistent SQLite data, user accounts, private wardrobe images, CRUD, optional local Ollama image recognition, outfit suggestions, saved outfits, preferences, feedback, wear counts, and export.

## Verification

- Frontend lint: passed (`npm run lint`, 2026-10-11).
- Frontend production build: passed (`npm run build`, Vite 8.3.1, 2026-10-11).
- Frontend error, multipart-header, and image URL/auth tests: 6 passed (`npm test`, 2026-10-11).
- Backend integration tests: 10 passed (`python -m pytest -q`, 2026-10-11), covering auth, CRUD, validation, private images/data, search/favorites, expanded preference persistence/validation/scoring, outfit create/read/update/delete and ownership, feedback exclusion, image replace/delete/missing-file behavior, additive migration preservation, database cleanup, and manual fallback without Ollama. Tests use isolated temporary databases and upload directories.
- Backend syntax: passed (`python -m py_compile app/main.py tests/test_api.py`).
- Manual browser smoke flow: passed against an isolated local API/database. Verified signup, three image uploads and authenticated photo rendering, profile save and browser refresh, one-piece outfit creation, outfit item replacement/update, duplicate/delete, recommendation customization/save, logout/login, and a real API process restart followed by image/session restoration.
- Image privacy is still enforced by owner-scoped `/uploads/{filename}`. Browser image components now fetch with the current bearer token (and cookies), then use revocable object URLs; this avoids relying on a cross-site `SameSite=Lax` cookie for native `<img>` requests.
- Ollama vision: no local server/model was configured; real inference remains unverified. The browser upload used manual entry with AI disabled.
- Original image-display cause: the authenticated image route required a bearer session or API cookie, but browser image tags cannot attach the app's custom bearer token. The default Vite/API hostnames (`localhost` versus `127.0.0.1`) can make that cookie cross-site and unavailable. Image requests now use authenticated `fetch`, normalized API URL resolution, loading states, and visible missing/broken-image fallbacks. Browser checks confirmed images still load after refresh, logout/login, and API restart.
- Upload error display regression: the Add Clothing file input previously had no `name="file"`, so browser `FormData` omitted the image. FastAPI returned a 422 validation array; the API helper passed that array into `Error`, displaying `[object Object]`. The input is now named correctly, the error utility formats validation arrays, and optional Ollama failures preserve manual uploads. Covered by frontend and backend regression tests.
- Style Profile persists style/color/occasion/season, fit, comfort/formality, variety, layering, weather preference, and disliked/recent controls. Styles, colors, occasions, seasons, formality and variety affect ranking where relevant item data exists; fit/layering and actual weather controls remain preferences until matching item/weather metadata is introduced.
- Outfit records now add description, notes, style, season, favorite, updated timestamp, and recommendation provenance using additive SQLite migrations. APIs support outfit detail and owner-checked updates; feedback can store a validated item-pair signature for exclusion. Existing saved data is retained.
- Deployment: not deployed; production readiness is not claimed.

## Remaining work

- Expand browser verification to image replacement and narrow mobile viewport usability; automated/API image replacement and responsive styles are covered, but those exact manual interactions were not exercised.
- Validate real Ollama output with an installed local vision model.
- Add clothing fit/layering/weather metadata and event-level wear history so more saved profile controls can influence scoring.
- Add migration tooling, rate limiting, recovery, CSRF hardening, image optimization, and hosted storage before deployment.

## Required credentials and external services

- None for local manual wardrobe/outfit functionality.
- Ollama is an optional local service, not an API key or paid subscription. Install the app and pull a vision model separately.
- No external accounts or deployment credentials are configured.

## Completion estimates

Local MVP subsystem maturity: frontend 70%, backend 75%, database 65%, AI integration 45% (configuration unverified), authentication 55%, recommendations 50%, personalization 35%, testing 45%, deployment 20%. These are honest scope estimates; no subsystem is production complete.
