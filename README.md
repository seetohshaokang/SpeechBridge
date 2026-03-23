# 🗣️ SpeechBridge

> **Built at Cursor Heilbronn Hackathon 2026**

Empowering people with speech disabilities through AI-powered speech correction. Record your speech, get instant AI transcription and correction, and hear it read back clearly.

---

## 🎯 The Problem

Over 40 million people worldwide live with speech disabilities (dysarthria, stuttering, aphasia). While communication tools exist, real-time AI correction with natural voice output remains difficult to access.

## 💡 Our Solution

One-tap recording → AI correction → Natural playback. No complex setup, works in your browser.

**Watch it work:** [SpeechBridge Demo Video](demo/SpeechBridge-Demo-Video.mp4)

**Try it now:** [https://speech-bridge.vercel.app](https://speech-bridge.vercel.app) (no local setup required!)

---

## ✨ Key Features

- **🎤 One-tap Recording** - Browser-based audio capture, no app install required
- **🤖 AI-Powered Correction** - Google Gemini analyzes speech patterns and fixes errors
- **🔊 Natural Playback** - ElevenLabs TTS with optional voice cloning
- **📊 Session History** - Track progress and improvements over time
- **♿ Accessibility First** - Designed for dysarthria, stuttering, aphasia, and general speech clarity
- **🔐 Secure & Private** - Clerk authentication, sessions stored securely in Convex

---

## 🔄 How It Works

1. **Record** - Capture speech through browser microphone
2. **Transcribe** - ElevenLabs Scribe converts speech to text
3. **Correct** - Gemini AI corrects speech errors while preserving intent
4. **Synthesize** - ElevenLabs TTS generates clear audio output
5. **Save** - Session stored in Convex for progress tracking

**All in under 5 seconds.**

---

## Demo Video

<video controls width="100%" src="demo/SpeechBridge-Demo-Video.mp4?raw=1"></video>
<!-- GitHub README embeds work best with raw URLs. -->

## 🛠️ Tech Stack

| Layer          | Tech                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| **Frontend**   | React (Vite), Clerk (auth), Convex (user data / optional sessions)                                             |
| **Backend**    | FastAPI (`api.main:app`) — `POST /process` (multipart audio → transcript → Gemini correction → ElevenLabs TTS) |
| **AI / voice** | Google Gemini (text correction), ElevenLabs (Scribe STT + TTS)                                                 |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and **Python 3.12+**
- API keys from: [Clerk](https://clerk.com), [Convex](https://convex.dev), [Google Gemini](https://aistudio.google.com), [ElevenLabs](https://elevenlabs.io)

### 1. Clone the Repository

```bash
git clone <your-fork-or-repo-url>
cd SpeechBridge
```

### 2. Setup Environment Files

Copy the example files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

**Edit `backend/.env`** with your API keys:

- `ELEVENLABS_API_KEY` - Your ElevenLabs API key
- `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` - Google Gemini keys
- `CONVEX_URL` - Your Convex deployment URL (get this after step 3)

**Edit `frontend/.env.local`** with:

- `VITE_CLERK_PUBLISHABLE_KEY` - Your Clerk publishable key
- `VITE_CONVEX_URL` - Your Convex deployment URL
- `VITE_API_URL=http://localhost:8001` - Backend URL

### 3. Install Dependencies & Setup Convex

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .

# Frontend
cd ../frontend
npm install

# Initialize Convex (first time only)
npx convex dev  # Follow prompts to create/link deployment
```

Copy the Convex deployment URL and add it to both `backend/.env` (`CONVEX_URL`) and `frontend/.env.local` (`VITE_CONVEX_URL`).

Configure Convex to work with Clerk:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-clerk-instance>.clerk.accounts.dev"
```

### 4. Run the App

From the **repo root**:

```bash
chmod +x deploy-local.sh
./deploy-local.sh
```

This starts all three services (Backend on port 8001, Frontend on port 5173, Convex dev). Press **Ctrl+C** to stop everything.

**Open** http://localhost:5173 and start using SpeechBridge!

<details>
<summary>📋 Detailed Backend Setup (click to expand)</summary>

## Backend Configuration

### Virtual Environment Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -e .
# or: pip install -r requirements.txt
```

**Alternative with uv** (faster):

```bash
cd backend
uv sync
```

### Environment Variables

Create **`backend/.env`** from the example:

```bash
cp .env.example .env
```

Edit **`backend/.env`** and configure:

| Variable             | Required            | Description                                                                                                                                                                                                                                               |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ELEVENLABS_API_KEY` | Yes                 | ElevenLabs API key (Scribe + TTS). For **Clone my voice**, the key must include the **`create_instant_voice_clone`** permission — enable it when creating/editing the key in the [ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys) page. |
| `GEMINI_API_KEY_1`   | Yes                 | Primary Gemini key                                                                                                                                                                                                                                        |
| `GEMINI_API_KEY_2`   | Yes                 | Used when key 1 hits quota                                                                                                                                                                                                                                |
| `GEMINI_API_KEY_3`   | Yes                 | Used when earlier keys hit quota                                                                                                                                                                                                                          |
| `GEMINI_CHAT_MODEL`  | No                  | Default in code is a fast Flash Lite model; override if your project returns 404                                                                                                                                                                          |
| `CONVEX_URL`         | Yes (for DB writes) | Same value as frontend **`VITE_CONVEX_URL`** (`https://….convex.cloud`). The Python API uses this to call Convex **`sessions:save`** after each `/process`. If unset, processing still works but **`sessions` stays empty**.                              |
| `FRONTEND_URL`       | No                  | Extra CORS origin for production frontends                                                                                                                                                                                                                |

### Running Backend Manually

```bash
cd backend
source .venv/bin/activate
uvicorn api.main:app --reload --port 8001
```

**Health check:**

```bash
curl http://localhost:8001/health
```

</details>

<details>
<summary>🎨 Detailed Frontend Setup (click to expand)</summary>

## Frontend Configuration

### Install Dependencies

```bash
cd frontend
npm install
```

### Environment Variables

Create **`frontend/.env.local`** (gitignored) from the example:

```bash
cp .env.example .env.local
```

Edit **`frontend/.env.local`**:

| Variable                     | Required            | Description                                                                    |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `VITE_API_URL`               | Yes (for full flow) | Backend base URL, e.g. `http://localhost:8001`                                 |
| `VITE_CONVEX_URL`            | Yes (for Convex)    | Convex deployment URL (`.convex.cloud`), from dashboard / `npm run convex:dev` |
| `VITE_CONVEX_SITE_URL`       | Optional            | Convex site URL (`.convex.site`); use if you rely on HTTP actions / site URL   |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (for auth)      | Clerk publishable key (`pk_...`)                                               |

### Running Frontend Manually

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** (or the URL Vite prints).

</details>

<details>
<summary>🗄️ Detailed Convex Setup (click to expand)</summary>

## Convex Configuration

Convex functions and schema live in **`frontend/convex/`**.

### Initial Setup

From the frontend directory:

```bash
cd frontend
npm install        # Installs Convex CLI + dependencies
```

### First-Time Convex + Clerk Integration

1. **Link Convex deployment:**

    From **`frontend/`**, run:

    ```bash
    npm run convex:dev
    # or: npx convex dev
    ```

    Log in and create or link a deployment. The CLI watches **`./convex/`** and syncs functions.

2. **Configure environment variables:**

    Put the deployment URL in:
    - **`frontend/.env.local`** as **`VITE_CONVEX_URL=https://....convex.cloud`**
    - **`backend/.env`** as **`CONVEX_URL=https://....convex.cloud`** (no `VITE_` prefix)

3. **Set up Clerk JWT validation:**

    From **`frontend/`**, run:

    ```bash
    npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-instance>.clerk.accounts.dev"
    ```

    Use the exact **Frontend API URL** from Clerk (Dashboard → Integrations → Convex).

4. **Enable Convex in Clerk:**

    In your Clerk dashboard, turn on the **Convex** integration and link it to the same app as the frontend.

### Production Deployment

```bash
cd frontend
npm run convex:deploy    # Deploy functions to your linked Convex deployment
npm run convex:dashboard # Open Convex dashboard via CLI
```

### Common Convex Commands

From `frontend/` directory:

- `npx convex env list` - View environment variables
- `npx convex env set KEY value` - Set environment variables
- `npx convex logs` - View function logs
- `npx convex deploy` - Deploy to production

### Using Production Convex

Point all these to the same **`.convex.cloud`** URL:

- **`frontend/.env.local`**: `VITE_CONVEX_URL`
- **`backend/.env`**: `CONVEX_URL`
- **`telegram-mtproto-voice/.env`**: `CONVEX_URL`

After changing deployment, run **`npx convex deploy`** from **`frontend/`** and set **`CLERK_JWT_ISSUER_DOMAIN`** on that deployment.

</details>

<details>
<summary>🔧 Manual Multi-Terminal Setup (click to expand)</summary>

## Running Services Separately

If you prefer to run services in separate terminals (useful for debugging):

### Terminal A — Convex

```bash
cd frontend
npm run convex:dev
```

Leave it running (watches **`./convex/`** and syncs functions).

### Terminal B — FastAPI Backend

```bash
cd backend
source .venv/bin/activate
uvicorn api.main:app --reload --port 8001
```

### Terminal C — Vite Frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** (or the URL Vite prints).

</details>

---

## 💪 Challenges We Overcame

- **Real-time audio processing** - Optimized pipeline to process speech in under 5 seconds
- **Voice cloning integration** - Implemented ElevenLabs instant voice cloning during the hackathon
- **Multi-key rotation** - Built automatic fallback system for API quota limits
- **Clinical accuracy** - Researched speech pathologies to design appropriate UI and onboarding flow
- **Seamless auth** - Integrated Clerk with Convex for smooth user experience

---

## 📱 Using the App

1. **Sign in** via Clerk (Apple, Google, or email)
2. **New users** go through onboarding:
    - Choose your condition (Dysarthria, Stuttering, Aphasia, or General)
    - Complete 10 practice recordings to calibrate the system
3. **Record & Correct:**
    - Tap record, speak naturally
    - Submit for AI correction
    - Listen to the corrected, clear version
4. **Track Progress** - View past sessions in the sidebar

---

## 🌐 Access SpeechBridge

### 🚀 Live Deployment
**Try it now:** [https://speech-bridge.vercel.app](https://speech-bridge.vercel.app)

No setup required - just open and start using!

### 💻 Local Development URLs

| Service      | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:5173        |
| API root     | http://localhost:8001/       |
| Health check | http://localhost:8001/health |
| OpenAPI docs | http://localhost:8001/docs   |

---

## 📁 Project Structure

```
SpeechBridge/
├── backend/           # FastAPI + AI agent (Gemini + ElevenLabs)
│   ├── api/main.py   # /health, /process endpoints
│   └── agent.py      # Speech correction logic
├── frontend/         # React + Vite + Clerk auth
│   ├── convex/       # Convex functions & schema
│   └── src/          # React components
├── deploy-local.sh   # One-command local deployment
└── README.md
```

<details>
<summary>Detailed File Structure (click to expand)</summary>

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
│   ├── agent.py              # Speech correction agent with Gemini
│   ├── pyproject.toml        # Python dependencies
│   └── .env.example          # Environment template
├── frontend/                 # Vite + React + Clerk + Convex
│   ├── convex/               # Convex functions, schema, auth.config (run CLI from frontend/)
│   ├── src/                  # React components and pages
│   ├── package.json          # Frontend dependencies
│   └── .env.example          # Frontend environment template
├── telegram-mtproto-voice/   # Telegram bot integration (optional)
├── deploy-local.sh           # Starts backend + frontend + Convex dev
└── README.md
```

</details>

---

## 👥 Team

Built with ❤️ at **Cursor Heilbronn Hackathon 2026**

---

## 🙏 Sponsors & Acknowledgments

Special thanks to our hackathon sponsors who provided free credits and made this project possible:

- **[Cursor](https://cursor.com)** - AI-powered development environment
- **[Vercel](https://vercel.com)** - Frontend hosting and deployment
- **[ElevenLabs](https://elevenlabs.io)** - Speech-to-text and text-to-speech APIs
- **[Convex](https://convex.dev)** - Real-time backend and database

---

## 📄 License

MIT License - Copyright (c) 2026 SpeechBridge Team

<details>
<summary>View full license (click to expand)</summary>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

</details>

---

## 🤝 Contributing

Contributions are welcome! Please:

- Open an issue to discuss major changes
- Follow existing code style and patterns
- **Never commit** `.env`, `.env.local`, or API keys
