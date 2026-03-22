# SpeechBuddy — Telegram MTProto voice note capture (consent-gated)

This folder is a small **Telethon** (MTProto) client that downloads **voice messages** from Telegram chats you explicitly allow in `ALLOWED_CHAT_IDS`.

App registration on Telegram is **SpeechBuddy** (`api_id` / `api_hash` from [my.telegram.org](https://my.telegram.org/apps) → *App configuration*). Credentials are in gitignored `.env` (not committed).

## What this is not

- There is **no Telegram API to access the phone microphone**. Voice is captured inside the Telegram app; you only receive **voice messages** already sent in chats your session can read.
- A **bot** cannot see arbitrary private chats between two users. Typical patterns: the logged-in **user account** is one of the participants, or everyone uses a **group** where your bot/user is present.

## Credentials you need

| Item | Where to get it |
|------|-----------------|
| **api_id** & **api_hash** | [my.telegram.org](https://my.telegram.org/apps) → *API development tools* → create an app (any title/short name is fine). |
| **Phone + login code** | First `python voice_listener.py` run; Telethon opens a user session (stored as `*.session`). Use 2FA password if the account has it. |
| **ALLOWED_CHAT_IDS** | Comma-separated numeric chat IDs (with written consent). Private peer: often the other user’s id. Groups: negative ids like `-100…`. |

Optional: discover ids via a one-off Telethon snippet or `@userinfobot`-style tools — only use ids you are allowed to process.

## Quick start

```bash
cd SpeechBridge/telegram-mtproto-voice   # or from SpeechBridge/: cd telegram-mtproto-voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# .env: api_id/api_hash, TELEGRAM_PHONE, ALLOWED_CHAT_IDS, TELEGRAM_BOT_TOKEN
python voice_listener.py          # user MTProto session (first run: Telegram login code)
python bot_listener.py            # @speechbridgebot — or start both:
chmod +x start_services.sh && ./start_services.sh
```

`start_services.sh` runs the **bot in the background** and **Telethon in the foreground** so the first-time login code prompt can read from your terminal (background jobs get no stdin and would raise `EOFError`).

Downloaded files go under `VOICE_DOWNLOAD_DIR` (default `downloads/voice/`). Pipe those files into your SpeechBridge / ASR / reconstruction pipeline next.

**Two processes:** `voice_listener.py` uses your **user** account (`speechbuddy.session`). `bot_listener.py` uses **`TELEGRAM_BOT_TOKEN`** only — no extra “login” for the bot beyond opening a chat and `/start` in Telegram.

### Voice cloning (Convex)

Set **`CONVEX_URL`** (same deployment as the SpeechBridge backend). For each Telegram sender, we store an ElevenLabs **`voice_id`** in the **`telegram_users`** table.

If someone **does not** have a cloned voice on file (no row, or `voice_id` empty), they are asked to send a **long enough** voice note (default **30s+**, `TELEGRAM_MIN_CLONE_SECONDS`) as the sample. That applies to **any** user without a stored clone — not only first-time accounts.

After `npx convex dev` / deploy, push the new schema (`telegram_users`).

### Backend: optional `voice_id` on `POST /process`

The Telegram listener passes **`voice_id`** so reconstruction uses the cloned voice without a Clerk profile.

## Consent

Use `consent_template.txt` as a starting point for written agreement on which `chat_id`s are in scope. Keep session files and `.env` secret.
