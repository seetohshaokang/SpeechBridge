"""Convex HTTP API helpers for the Telegram listener (same protocol as backend/util/convex_http)."""

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


def _parse_convex_response(data: dict[str, Any]) -> Any:
    status = data.get("status")
    if status == "error":
        msg = data.get("errorMessage") or "Unknown Convex error"
        raise RuntimeError(msg)
    if status != "success":
        raise RuntimeError(f"Unexpected Convex response status: {data!r}")
    if "value" not in data:
        return None
    return data["value"]


async def convex_query(path: str, args: dict) -> Any:
    base = convex_deployment_url()
    if not base:
        return None
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base}/api/query",
            headers=convex_auth_headers(),
            json={"path": path, "args": args, "format": "json"},
        )
        resp.raise_for_status()
        return _parse_convex_response(resp.json())


async def convex_mutation(path: str, args: dict) -> Any:
    base = convex_deployment_url()
    if not base:
        return None
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base}/api/mutation",
            headers=convex_auth_headers(),
            json={"path": path, "args": args, "format": "json"},
        )
        resp.raise_for_status()
        return _parse_convex_response(resp.json())
