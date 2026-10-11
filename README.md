# Ai-Wardrobe

A local-first personal wardrobe app. Add clothing photos, organize pieces, save outfit combinations, and let an optional local vision model suggest clothing attributes. Accounts, wardrobe records, and images are stored privately on the machine running the API.

## What works today

- Private account registration and login with PBKDF2 password hashing, bearer sessions, and an HTTP-only cookie fallback for authenticated API/image access.
- SQLite persistence, user-scoped clothing CRUD, image replacement, search and category/color/season/favorite filters, favorites, and data export.
- Safe JPG, PNG, and WebP uploads with content-signature validation and an 8 MB limit. Images are only served to their owner.
- Optional real image analysis through a locally running Ollama vision model; manual entry works without AI.
- Saved outfits, occasion-aware suggestions, explainable compatibility scores, style preferences, feedback, and event-level wear history with insights and recommendation variety scoring.
- Optional weather-aware outfit ranking. Users can enter conditions manually without any provider, or request current conditions from the configurable Open-Meteo adapter.
- Private image delivery through authenticated API fetches, loading/error placeholders, and URL resolution based on `VITE_API_BASE_URL` (`VITE_API_URL` remains a compatibility alias).
- Interactive Style Profile for style identity, favorite/avoided/neutral/accent colors, occasions, seasons, fit, comfort/formality, variety, layering, and recent/disliked controls. Available clothing attributes, weather context, and event history affect deterministic recommendation ranking.
- Manual Outfit Builder using the signed-in user's real wardrobe items; one-piece outfits are valid. Saved outfits can be viewed, edited, duplicated, favorited, and deleted.
- Responsive React/Vite interface with account setup, wardrobe, outfit ideas, saved looks, and style profile.

See [PROJECT_AUDIT.md](PROJECT_AUDIT.md), [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md), and [PROJECT_STATUS.md](PROJECT_STATUS.md) for scope and verification details.

## Stack

- Frontend: React 19, Vite 8, JavaScript.
- API: Python 3.12+, FastAPI, Pydantic.
- Storage: SQLite (Python standard library) and local image files.
- Optional AI: Ollama `/api/generate` with an installed vision model such as `llava` or `qwen2.5vl`.

## Windows setup (PowerShell)

Open two terminals from the repository root.

### Backend terminal

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:APP_ENV = "development"
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
python -m uvicorn app.main:app --reload
```

If PowerShell blocks activation, use `Set-ExecutionPolicy -Scope Process RemoteSigned` in that terminal and activate again. The API creates `backend/data/wardrobe.sqlite3` and `backend/uploads/` on first start; neither is removed during normal startup.

### Frontend terminal

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. The API is at <http://127.0.0.1:8000> and interactive API docs are at <http://127.0.0.1:8000/docs>.

To use a different API address, create `frontend/.env.local` with `VITE_API_BASE_URL=http://127.0.0.1:8000` (or the actual API base, including a path prefix if used). `VITE_API_URL` is also accepted for existing setups. Set `CORS_ORIGINS` on the backend to the exact frontend origin. Do not commit environment files.

## Optional local AI

Install Ollama separately and pull a vision model supported by Ollama. For example, Qwen2.5-VL 3B is a vision model whose published quantized download is about 3.2 GB; allow additional disk space for the Ollama runtime and model storage. Memory and inference speed depend on your hardware and quantization. Check available disk and memory before pulling it.

```powershell
ollama pull qwen2.5vl:3b
ollama serve
```

In the backend terminal, set:

```powershell
$env:OLLAMA_URL = "http://localhost:11434"
$env:OLLAMA_MODEL = "qwen2.5vl:3b"
$env:OLLAMA_TIMEOUT_SECONDS = "90"
```

Restart the API. The add form can check `/ai/status` and, when its AI option is enabled, sends the selected image as base64 in Ollama's local `/api/generate` request. JSON is parsed and allowlisted; the user's name/category/color take precedence over generated values. Ollama errors and malformed responses fall back to manual entry with a visible notice; upload validation and database failures remain failures. Images are not sent to a hosted AI provider. No Ollama model is bundled, and real inference has not been verified in this environment. See the [Ollama vision API guide](https://github.com/ollama/ollama/blob/main/docs/capabilities/vision.mdx) and [Qwen2.5-VL 3B model page](https://ollama.com/library/qwen2.5vl%3A3b).

## Optional weather context

The Outfit Ideas page always works without a weather provider. Enter temperature and dry/rain/snow conditions manually, or enable current weather lookup. Lookup uses Open-Meteo geocoding and current forecast endpoints only after the user searches for a city and selects a result; it does not request precise browser location permission.

For personal, noncommercial use, set this in the backend terminal before starting the API:

```powershell
$env:WEATHER_PROVIDER = "open-meteo"
```

The public Open-Meteo endpoints are the defaults and do not require a key for noncommercial use. For paid/commercial use, configure the customer endpoint and key through `OPEN_METEO_FORECAST_URL`, `OPEN_METEO_GEOCODING_URL`, and `OPEN_METEO_API_KEY` as specified by your Open-Meteo plan. Never commit a key. If weather is unconfigured or unavailable, the interface reports that and manual conditions remain available. The app sends conditions to recommendation requests only when the user applies them. Weather scores use recorded temperature, precipitation, and condition codes; the app does not infer waterproofing or breathability from unknown garment attributes.

The Open-Meteo free API is limited to noncommercial use and currently documents request limits of 10,000/day, 5,000/hour, and 600/minute; the provider requires attribution under CC BY 4.0. Review the current [usage terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing), [forecast API](https://open-meteo.com/en/docs), and [geocoding API](https://open-meteo.com/en/docs/geocoding-api) before enabling it. The Outfit Ideas page links to Open-Meteo and CC BY 4.0 when weather context is available.

## Data and privacy

- SQLite file: `backend/data/wardrobe.sqlite3` by default. Set `DATABASE_PATH` to move it.
- Images: `backend/uploads/` by default. Set `WARDROBE_UPLOAD_DIR` to move them.
- Use `WARDROBE_DATA_DIR` to move the default data directory.
- Back up the database and image directory together while the API is stopped. This app does not yet encrypt data at rest.
- Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes, never plaintext. Bearer session tokens are stored as hashes. Image components fetch private image endpoints with the current bearer token and cookies, then render short-lived browser object URLs; they never expose filesystem paths or make uploads public. The HTTP-only cookie remains available as an API-session fallback.
- Account deletion removes the account, database-owned records, sessions, and that account's images.
- Keep the API bound to localhost for personal use. The current app has no production rate limiter, password reset, email verification, or multi-device session management.
- Existing SQLite databases are extended with additive startup migrations for preference and outfit fields; user and outfit records are retained. Keep the same database and uploads directories after restart.

## Style profile and outfit workflow

Use **Style profile** to choose style tags, colors, occasions, seasons, fit/comfort and recommendation controls, then save. Colors to avoid lower matching outfit scores; preferred styles/colors/occasions/seasons and available formality metadata can improve scores. If relevant clothing metadata is missing, scoring falls back to category and palette rules. Weather-aware ranking uses selected current/manual conditions plus known category or season tags; it does not infer waterproofing, breathability, or garment warmth. Fit preference is stored but is not scored until clothing fit metadata exists.

Open **Outfit builder** to select actual wardrobe pieces using search, category, or favorites. Save one or more pieces, including a single dress. From **Saved outfits**, edit details and pieces, favorite, duplicate into a new draft, or delete. Recommendation cards open in the builder as recommendation-sourced drafts, and the saved outfit retains that provenance. The API validates clothing ownership on create and update.

## Tests and build checks

```powershell
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
python -m py_compile app/main.py

cd ..\frontend
npm run lint
npm test
npm run build
```

Backend tests use a temporary SQLite database and temporary upload folder. Frontend dependencies are pinned by the committed `frontend/package-lock.json`.

Backend integration tests use an isolated temporary database and upload directory. The earlier browser verification on 2026-10-11 covered signup, image upload/rendering, profile save and refresh, outfit build/edit/duplicate/delete, recommendation-to-builder, logout/login, and a real API process restart. The current weather/AI UI changes have not been manually browser-verified. Ollama inference is not configured or tested.

## Deployment notes

The implementation is configured for local development, not deployed production. Before hosting, choose a persistent hosted database and private object storage, set HTTPS and secure cookie/CORS origins, add rate limiting and account recovery, run a migration plan, and configure backup/monitoring. SQLite and the local uploads directory are not suitable as ephemeral hosted storage. AI requests currently target Ollama and assume the model host is reachable from the API process. No deployment provider, hosted database, public endpoint, or production readiness is claimed.

## Troubleshooting

- `Sign in to continue`: sign in again; sessions are bearer-backed and browser cookies are local to the API origin.
- Browser CORS errors: make `CORS_ORIGINS` exactly match the address in your browser, including scheme and port, then restart the API.
- `Address already in use`: stop the process using port 8000 or 5173 before restarting.
- Images show an error: keep the API running and check that `VITE_API_BASE_URL` points to it and that the frontend origin is listed in `CORS_ORIGINS`; authenticated image fetches use the bearer session and do not rely on cross-site image cookies.
- AI unavailable: verify Ollama is running, the configured model is pulled, and `OLLAMA_URL` is reachable from the backend terminal.
