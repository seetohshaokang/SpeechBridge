#!/usr/bin/env bash
# Start Bot API poller in the background, Telethon user listener in the foreground.
# Voice must stay in the foreground on first run so stdin is available for the Telegram login code.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3.11 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install -qr requirements.txt

cleanup() {
  kill "${BOT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python bot_listener.py &
BOT_PID=$!

python voice_listener.py
