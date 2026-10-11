# Project status

Updated 2026-10-11.

## Summary

Ai-Wardrobe is a local-first MVP with React/Vite, FastAPI, SQLite, private user-scoped images, event-level wear history, saved outfits, recommendations, and optional Ollama vision. This phase added weather context and recommendation scoring, provider status visibility, stronger provider response handling, expanded automated coverage, and updated project documentation. Existing local database and uploaded images were preserved.

## Verification

- Frontend lint: passed (`npm run lint`).
- Frontend tests: 8 passed (`npm test`), covering structured/FastAPI/network error extraction, multipart headers/auth, API/image URL behavior, wear-event payloads, and weather recommendation request metadata.
- Frontend production build: passed (`npm run build`, Vite 8.3.1).
- Backend syntax: passed (`python -m py_compile app/main.py tests/test_api.py`).
- Backend integration suite: 19 passed (`python -m pytest -q --basetemp .pytest-tmp`). Tests use isolated temporary SQLite and uploads directories. Coverage includes auth/signup/login/logout, upload validation and privacy, CRUD/search/favorites, saved outfits/feedback, persistence and migration, wear event behavior, AI response normalization and manual fallback, provider-status behavior, weather input/provider failures, manual recommendation use, weather scoring, and wear-history scoring interaction.
- Provider realism: weather and Ollama HTTP responses are mocked in automated tests. No live Open-Meteo API request or real vision inference was performed.
- Browser verification: an earlier 2026-10-11 isolated browser smoke covered the main auth, upload/image, profile, builder, saved-outfit, recommendation, and backend-restart flows. This verification pass did not browser-test the newly added weather panel or AI status control. Do not treat this as verification of the latest UI changes.
- Ollama: `ollama` was not installed/configured in the inspected environment. No model was pulled. Actual inference remains unverified.
- Data safety: tests used temporary paths; the existing `backend/data` and `backend/uploads` were not deleted or modified intentionally.

## New behavior

- Weather lookup is optional and disabled unless `WEATHER_PROVIDER=open-meteo`. A signed-in user can search for a city, select a result, and request current conditions. No precise browser location permission is requested. Manual temperature and dry/rain/snow conditions work without an external provider.
- Recommendation requests pass weather fields only when context has been selected. Existing preferences, occasion/formality, feedback, disliked pairs, and event wear history continue to be applied. Known outerwear/cold-season metadata can affect cold-weather scores; warm-season tags can affect warm-weather scores; rain explanations explicitly say water resistance is unknown. Incomplete metadata does not disqualify an outfit.
- Weather failures are returned as a concise fallback message; manual recommendations remain usable. The UI links to Open-Meteo attribution and CC BY 4.0.
- `/ai/status` reports whether the configured Ollama endpoint/model is reachable. Ollama analysis uses the configured local `/api/generate` endpoint, base64 image payload, configurable bounded timeout, structured parsing, and allowlisted values. User-provided name/category/color take precedence, generated values remain in `ai_attributes`, and AI errors fall back to manual entry with a warning.

## Setup

Run the backend in one PowerShell terminal from the repository root:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:APP_ENV = "development"
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
# Optional automatic weather (personal, noncommercial use):
$env:WEATHER_PROVIDER = "open-meteo"
python -m uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. For local vision analysis, install Ollama and run `ollama pull qwen2.5vl:3b`; set `$env:OLLAMA_URL="http://localhost:11434"` and `$env:OLLAMA_MODEL="qwen2.5vl:3b"` before starting the backend. The published model quantization is about 3.2 GB, plus runtime/storage overhead; hardware memory and speed vary. Check the linked model/Ollama requirements first. No model is included in the repo.

Open-Meteo free endpoints are for noncommercial use and require attribution; paid usage requires a customer endpoint/key. See README provider documentation before enabling it for anything beyond personal use.

## Limitations and remaining work

- The current weather UI and AI status indicator need manual browser verification. Use isolated test database/upload paths during local workflow testing.
- Live weather depends on external internet and configured provider. Manual weather does not.
- Real Ollama inference remains unverified until a model is installed and exercised with an image.
- Fit, insulation, waterproofing, and breathability are not represented as clothing metadata, so recommendation logic does not claim them.
- The backend is still a compact single module with additive rather than versioned migrations. Account recovery, rate limiting, cookie-mutation CSRF strategy, image scanning/optimization, and deployment hardening remain open.
- App is not deployed and is not production-ready.

## Completion estimates

For the personal local MVP (not a production-readiness rating): frontend 78%, backend 82%, persistence 80%, AI integration 60% (provider path tested, real inference not tested), authentication 65%, recommendations 70%, personalization 60%, testing 65%, deployment preparation 25%.
