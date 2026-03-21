"""FastAPI entrypoint for Vercel serverless functions."""

from fastapi import FastAPI

app = FastAPI(title="SpeechBridge Backend")


@app.get("/health")
def health_check() -> dict[str, str]:
    """Simple health endpoint so deployments have a quick check."""
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Default landing route; expand with your AI logic later."""
    return {"message": "SpeechBridge backend is alive"}
