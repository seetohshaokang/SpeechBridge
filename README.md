# SpeechBridge

Helping people with speech disabilities communicate more clearly — record speech, get AI-assisted transcription and correction, and hear the improved version read back.

## Stack

| Layer | Tech |
|--------|------|
| **Frontend** | React (Vite), Clerk (auth), Convex (user data / optional sessions) |
| **Backend** | FastAPI (`api.main:app`) — `POST /process` (multipart audio → transcript → Gemini correction → ElevenLabs TTS) |
| **AI / voice** | Google Gemini (text correction), ElevenLabs (Scribe STT + TTS) |

---

## Prerequisites

On a **new machine**, install:

| Tool | Notes |
|------|--------|
| **Git** | Any recent version |
| **Node.js** | **18+** (20+ recommended) — includes `npm` |
| **Python** | **3.12+** (3.13 ok) |
| **pip** | Usually bundled with Python |

After clone, run **`npm install` twice**: once at the **repo root** (Convex CLI for `convex/`) and once in **`frontend/`** (Vite + React).

Optional but useful:

- **[uv](https://docs.astral.sh/uv/)** — faster Python env / installs (`uv sync` in `backend/` if you use it)

Accounts / keys you will need:

- [Clerk](https://dashboard.clerk.com) — app + publishable key; enable **Convex** integration; copy **Frontend API URL** (issuer).
- [Convex](https://dashboard.convex.dev) — project linked from **`npm run convex:dev`** (or `npx convex dev`) at the **repo root** where `convex/` lives.
- [Google AI Studio](https://aistudio.google.com) — Gemini API key(s) (this repo rotates across **three** keys).
- [ElevenLabs](https://elevenlabs.io) — API key (Scribe + TTS).

---

## 1. Clone the repository

```bash
git clone <your-fork-or-repo-url>.git
cd SpeechBridge
```

If the remote moved, ensure `origin` points at the canonical repo:

```bash
git remote -v
```

---

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -e .
# or: pip install -r requirements.txt
```

Create **`backend/.env`** from the example (never commit `.env`):

```bash
cp .env.example .env
```

Edit **`backend/.env`** and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key |
| `GEMINI_API_KEY_1` | Yes | Primary Gemini key |
| `GEMINI_API_KEY_2` | Yes | Used when key 1 hits quota |
| `GEMINI_API_KEY_3` | Yes | Used when earlier keys hit quota |
| `GEMINI_CHAT_MODEL` | No | Default in code is a fast Flash Lite model; override if your project returns 404 |
| `CONVEX_URL` | Yes (for DB writes) | Same value as frontend **`VITE_CONVEX_URL`** (`https://….convex.cloud`). The Python API uses this to call Convex **`sessions:save`** after each `/process`. If unset, processing still works but **`sessions` stays empty**. |
| `FRONTEND_URL` | No | Extra CORS origin for production frontends |

**Quick health check** (after the server is running — see below):

```bash
curl http://localhost:8001/health
```

---

## 3. Convex (repo root)

Convex functions and schema live in **`convex/`** at the **SpeechBridge repo root** (not inside `frontend/`), so backend-oriented teammates can work on the same tree without touching the Vite app.

From the repo root:

```bash
cd SpeechBridge    # repository root
npm install        # Convex CLI + shared dependency (run once after clone)
```

**Convex + Clerk (first time)**

1. From the **repo root**, run **`npm run convex:dev`** (same as `npx convex dev`) and log in; create or link a deployment. The CLI watches **`./convex/`** and syncs functions. Put the deployment URL in **`frontend/.env.local`** as **`VITE_CONVEX_URL=...`** (and optionally **`VITE_CONVEX_SITE_URL=...`**) and the **same URL** in **`backend/.env`** as **`CONVEX_URL=...`** (no `VITE_` prefix — that file is not read by Vite). Without **`CONVEX_URL`**, the backend never writes to Convex.
2. Set Convex to validate Clerk JWTs (from **repo root**):
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-instance>.clerk.accounts.dev"
   ```
   Use the exact **Frontend API URL** from Clerk (Integrations → Convex).
3. In Clerk, turn on the **Convex** integration and use the same app as the frontend.

**Production / shared dev deployment** (from **repo root**):

```bash
npm run convex:deploy    # deploy functions to your linked Convex deployment
npm run convex:dashboard # open Convex dashboard via CLI
```

Other common commands (repo root): `npx convex env list`, `npx convex env set …`, `npx convex logs`.

**If you had `convex.json` under `frontend/` before:** move it to the **repo root** next to `package.json`, or run `npm run convex:dev` again from the root and re-link when prompted.

---

## 4. Frontend setup

```bash
cd frontend
npm install
```

Create **`frontend/.env.local`** (gitignored) from the example:

```bash
cp .env.example .env.local
```

Edit **`frontend/.env.local`**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (for full flow) | Backend base URL, e.g. `http://localhost:8001` |
| `VITE_CONVEX_URL` | Yes (for Convex) | Convex deployment URL (`.convex.cloud`), from dashboard / `npm run convex:dev` |
| `VITE_CONVEX_SITE_URL` | Optional | Convex site URL (`.convex.site`); use if you rely on HTTP actions / site URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (for auth) | Clerk publishable key (`pk_...`) |

---

## 5. Run everything locally

You need **three** long-running processes for the full app (auth + Convex sync + API + UI):

### Terminal A — Convex

```bash
cd SpeechBridge    # repo root
npm run convex:dev
```

Leave it running (watches **`./convex/`** at the repo root and syncs functions).

### Terminal B — FastAPI

```bash
cd backend
source .venv/bin/activate
uvicorn api.main:app --reload --port 8001
```

### Terminal C — Vite

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** (or the URL Vite prints).

### Optional: one script for backend + frontend only

From the **repo root**:

```bash
chmod +x deploy-local.sh
./deploy-local.sh
```

This starts **backend** (port **8001**) and **frontend** (port **5173**).  
You still run **`npm run convex:dev`** from the **repo root** separately if you use Convex/Clerk.

---

## 6. Using the app

1. Sign in via Clerk (Apple, Google, or email).
2. **New users** are taken through an **onboarding flow**:
   - Choose a **condition** (Dysarthria, Stuttering, Aphasia, or General). Each option has a hover/tap **?** info button with a clinical description.
   - Read **10 practice phrases** aloud — each phrase must be recorded and submitted before you can proceed. Recordings go through the same `/process` pipeline and are saved to Convex (results are not shown during onboarding).
   - On completion, the condition is saved to the user profile.
3. **Returning users** skip onboarding and land on the main session view.
4. **Record** → **Submit for correction** — backend runs: ElevenLabs STT → Gemini correction → ElevenLabs TTS; the UI shows transcript, corrected text, and optional audio playback.
5. Past sessions are listed in the **left sidebar**; click any to review. **+ New session** resets the workspace.

---

## 7. Troubleshooting

| Issue | What to try |
|--------|-------------|
| `ModuleNotFoundError` (Python) | Activate **`backend/.venv`** and run `pip install -e .` or `pip install -r requirements.txt`. |
| `Form data requires python-multipart` | Install deps from current `pyproject.toml` / `requirements.txt` (includes `python-multipart`). |
| `Unsupported audio type 'audio/webm;codecs=opus'` | Use latest `main.py` (base MIME check); restart backend. |
| Gemini `404` / model not found | Set `GEMINI_CHAT_MODEL` in `backend/.env` to a model your API key supports (see [AI Studio](https://aistudio.google.com)). |
| `'list' object has no attribute 'strip'` | Fixed in current `agent.py` (normalizes Gemini message content). Pull latest. |
| `ELEVENLABS_API_KEY` / `GEMINI_*` KeyError | Fill **`backend/.env`**; keys must be plain strings, not JSON arrays. |
| Frontend can’t reach API | `VITE_API_URL=http://localhost:8001` in **`frontend/.env.local`**; restart `npm run dev`. |
| CORS errors | Backend allows `http://localhost:5173` by default; add `FRONTEND_URL` if you use another origin. |
| Convex auth errors | Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment (`npx convex env set …` from **repo root**); Clerk Convex integration enabled. |
| Convex CLI “can’t find convex folder” | Run Convex commands from **repo root** (`cd SpeechBridge`), not `frontend/`. |
| Convex **`sessions` table empty** | Set **`CONVEX_URL`** in **`backend/.env`** to the same `.convex.cloud` URL as **`VITE_CONVEX_URL`**, restart FastAPI, and check logs for `Convex save failed` / `CONVEX_URL is not set`. |
| **`frontend/convex/_generated` appeared** | The Convex CLI writes `convex/` relative to the shell’s cwd. Running `npx convex dev` **inside `frontend/`** creates a useless stub there. **Delete `frontend/convex`**, then only use **`npm run convex:dev`** from the **repo root**, or from `frontend/` run **`npm run convex:dev`** (it forwards to the root — see `frontend/package.json`). |

---

## 8. Useful URLs (local)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API root | http://localhost:8001/ |
| Health | http://localhost:8001/health |
| OpenAPI docs | http://localhost:8001/docs |

---

## 9. Project layout (short)

```
SpeechBridge/
├── package.json              # Root: Convex CLI scripts (convex:dev, convex:deploy, …)
├── convex/                   # Convex functions, schema, auth.config (run CLI from repo root)
│   ├── schema.ts             # users (+ onboarding_completed), sessions, profile_versions
│   ├── users.ts              # syncCurrentUser, completeOnboarding, getProfile, …
│   └── sessions.ts           # save, listByUser, get, getForSummarisation
├── backend/                  # FastAPI + agent (Gemini + ElevenLabs)
│   ├── api/
│   │   └── main.py           # /health, /process (multipart audio → correction → TTS)
│   ├── agent.py
│   └── .env.example
├── frontend/                 # Vite + React + Clerk
│   ├── src/
│   │   ├── App.jsx           # Root routes: Landing / SignIn / AuthenticatedApp
│   │   ├── AuthenticatedApp.jsx  # Sidebar + topbar + onboarding gate + SpeechSession
│   │   ├── OnboardingFlow.jsx    # Condition picker → 10 recorded phrases → completeOnboarding
│   │   ├── SpeechSession.jsx     # Record → submit → results (uses profile condition)
│   │   ├── SessionSidebar.jsx    # Past sessions list, new-session button
│   │   ├── LandingPage.jsx       # Public marketing page
│   │   ├── onboarding/
│   │   │   └── onboardingData.js # Phrases + descriptions per condition
│   │   └── hooks/
│   │       ├── useAudioRecorder.js  # MediaRecorder + Web Audio analyser
│   │       └── useMediaQuery.js     # Responsive breakpoint hook
│   └── .env.example
├── deploy-local.sh           # Backend + frontend only (not Convex)
└── README.md
```

---

## License / contributing

Follow your team’s guidelines for issues and pull requests. **Do not commit** `.env`, `.env.local`, or API keys.
