"""
Shared Convex Functions HTTP client helpers (used by main.py and summarise.py).

Set CONVEX_URL in backend/.env to the same deployment URL as VITE_CONVEX_URL
(e.g. https://your-deployment.convex.cloud).

Optional: CONVEX_DEPLOY_KEY — only if Convex returns 401 without it for your project.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


def convex_deployment_url() -> str:
    return (os.environ.get("CONVEX_URL") or "").strip().rstrip("/")


def convex_auth_headers() -> dict[str, str]:
    headers: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    key = (os.environ.get("CONVEX_DEPLOY_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Convex {key}"
    return headers


def convex_request_body(path: str, args: dict) -> dict:
    return {"path": path, "args": args, "format": "json"}


def parse_convex_response(data: dict[str, Any]) -> Any:
    """Raise if Convex returned status error; return value (may be list, dict, None)."""
    status = data.get("status")
    if status == "error":
        msg = data.get("errorMessage") or "Unknown Convex error"
        raise RuntimeError(msg)
    if status != "success":
        raise RuntimeError(f"Unexpected Convex response status: {data!r}")
    if "value" not in data:
        return None
    return data["value"]
