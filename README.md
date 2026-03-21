# SpeechBridge

Helping people with speech disabilities communicate more clearly — record speech, get AI-assisted transcription and correction, and hear the improved version read back.

## Stack

| Layer | Tech |
|--------|------|
| **Frontend** | React (Vite), Clerk (auth), Convex (user data / optional sessions) |
| **Backend** | FastAPI (`main:app`) — `POST /process` (multipart audio → transcript → Gemini correction → ElevenLabs TTS) |
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

Optional but useful:

- **[uv](https://docs.astral.sh/uv/)** — faster Python env / installs (`uv sync` in `backend/` if you use it)

Accounts / keys you will need:

- [Clerk](https://dashboard.clerk.com) — app + publishable key; enable **Convex** integration; copy **Frontend API URL** (issuer).
- [Convex](https://dashboard.convex.dev) — project linked from `npx convex dev` in `frontend/`.
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
| `CONVEX_URL` | No | Convex HTTP URL if you want `POST /process` to persist sessions via Convex |
| `FRONTEND_URL` | No | Extra CORS origin for production frontends |

**Quick health check** (after the server is running — see below):

```bash
curl http://localhost:8000/health
```

---

## 3. Frontend setup

```bash
cd ../frontend
npm install
```

Create **`frontend/.env.local`** (gitignored) from the example:

```bash
cp .env.example .env.local
```

Edit **`frontend/.env.local`**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (for full flow) | Backend base URL, e.g. `http://localhost:8000` |
| `VITE_CONVEX_URL` | Yes (for Convex) | From Convex / `npx convex dev` (e.g. `VITE_CONVEX_URL=...`) |
| `VITE_CONVEX_SITE_URL` | Often set by Convex CLI | Convex site URL if your tooling adds it |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (for auth) | Clerk publishable key (`pk_...`) |

**Convex + Clerk (first time)**

1. In **`frontend/`** run `npx convex dev` and log in; create/link a deployment. This writes Convex URLs into `.env.local`.
2. Set Convex to validate Clerk JWTs:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-instance>.clerk.accounts.dev"
   ```
   Use the exact **Frontend API URL** from Clerk (Integrations → Convex).
3. In Clerk, turn on the **Convex** integration and use the same app as the frontend.

---

## 4. Run everything locally

You need **three** long-running processes for the full app (auth + Convex sync + API + UI):

### Terminal A — Convex

```bash
cd frontend
npx convex dev
```

Leave it running (watches `convex/` and syncs functions).

### Terminal B — FastAPI

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Use **`main:app`** (full API including `POST /process`).  
`api.main:app` is a minimal entry for serverless and does **not** include the speech pipeline.

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

This starts **backend** (port **8000**) and **frontend** (port **5173**).  
You still run **`npx convex dev`** separately if you use Convex/Clerk.

---

## 5. Using the app

1. Sign in (Clerk).
2. Choose **Condition** (e.g. General, Dysarthria).
3. **Record** → **Submit for correction**.
4. Backend runs: ElevenLabs STT → Gemini correction → ElevenLabs TTS; the UI shows transcript, corrected text, and optional audio playback.

---

## 6. Troubleshooting

| Issue | What to try |
|--------|-------------|
| `ModuleNotFoundError` (Python) | Activate **`backend/.venv`** and run `pip install -e .` or `pip install -r requirements.txt`. |
| `Form data requires python-multipart` | Install deps from current `pyproject.toml` / `requirements.txt` (includes `python-multipart`). |
| `Unsupported audio type 'audio/webm;codecs=opus'` | Use latest `main.py` (base MIME check); restart backend. |
| Gemini `404` / model not found | Set `GEMINI_CHAT_MODEL` in `backend/.env` to a model your API key supports (see [AI Studio](https://aistudio.google.com)). |
| `'list' object has no attribute 'strip'` | Fixed in current `agent.py` (normalizes Gemini message content). Pull latest. |
| `ELEVENLABS_API_KEY` / `GEMINI_*` KeyError | Fill **`backend/.env`**; keys must be plain strings, not JSON arrays. |
| Frontend can’t reach API | `VITE_API_URL=http://localhost:8000` in **`frontend/.env.local`**; restart `npm run dev`. |
| CORS errors | Backend allows `http://localhost:5173` by default; add `FRONTEND_URL` if you use another origin. |
| Convex auth errors | Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment; Clerk Convex integration enabled. |

---

## 7. Useful URLs (local)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API root | http://localhost:8000/ |
| Health | http://localhost:8000/health |
| OpenAPI docs | http://localhost:8000/docs |

---

## 8. Project layout (short)

```
SpeechBridge/
├── backend/           # FastAPI + agent (Gemini + ElevenLabs)
│   ├── main.py        # Full app: /health, /process, …
│   ├── agent.py
│   ├── api/main.py    # Slim app for serverless demos
│   └── .env.example
├── frontend/          # Vite + React + Convex + Clerk
│   ├── convex/
│   └── .env.example
├── deploy-local.sh    # Backend + frontend only
└── README.md
```

---

## License / contributing

Follow your team’s guidelines for issues and pull requests. **Do not commit** `.env`, `.env.local`, or API keys.
