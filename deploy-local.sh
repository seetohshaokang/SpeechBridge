#!/bin/bash

echo "🚀 Starting SpeechBridge local development..."
echo ""
echo "Note: Convex is not started here. From repo root run: npm run convex:dev"
echo ""

trap 'echo ""; echo "🛑 Shutting down..."; kill 0; exit 0' INT TERM

echo "📦 Starting Backend (port 8000)..."
# Prefer project venv (run once: cd backend && python3 -m venv .venv && .venv/bin/pip install -e .)
if [ -x backend/.venv/bin/uvicorn ]; then
  (cd backend && .venv/bin/uvicorn api.main:app --reload --port 8000) &
else
  (cd backend && uvicorn api.main:app --reload --port 8000) &
fi
BACKEND_PID=$!

echo "⚛️  Starting Frontend (port 5173)..."
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "🗄️  Starting Convex..."
npx convex dev &
CONVEX_PID=$!
 
echo ""
echo "✅ Services running:"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo "   Convex:   https://dashboard.convex.dev"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""
 
wait
