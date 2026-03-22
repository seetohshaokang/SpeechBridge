"""
Telegram Bot API — long polling (@speechbridgebot).

Separate from voice_listener.py (user MTProto session). Users open the bot
and send /start; this does not replace user login for voice capture in DMs.

Run:
  source .venv/bin/activate && python bot_listener.py
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message:
        await update.message.reply_text(
            "SpeechBridge bot is online. "
            "Voice capture in chats uses the separate Telethon user session."
        )


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        logger.error("Set TELEGRAM_BOT_TOKEN in .env (from @BotFather).")
        sys.exit(1)

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start_cmd))

    logger.info("Bot polling (Ctrl+C to stop)")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
