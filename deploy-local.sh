#!/bin/bash

echo "🚀 Starting SpeechBridge local development..."
echo ""

trap 'echo ""; echo "🛑 Shutting down..."; kill 0; exit 0' INT TERM

echo "📦 Starting Backend (port 8000)..."
# main:app is the full API (includes POST /process). api.main is the slim Vercel stub.
# Prefer project venv (run once: cd backend && python3 -m venv .venv && .venv/bin/pip install -e .)
if [ -x backend/.venv/bin/uvicorn ]; then
  (cd backend && .venv/bin/uvicorn main:app --reload --port 8000) &
else
  (cd backend && uvicorn main:app --reload --port 8000) &
fi
BACKEND_PID=$!

echo "⚛️  Starting Frontend (port 5173)..."
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Services running:"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

wait
