"""FastAPI entrypoint for Vercel serverless functions."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SpeechBridge Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Simple health endpoint so deployments have a quick check."""
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Default landing route; expand with your AI logic later."""
    return {"message": "SpeechBridge backend is alive"}
