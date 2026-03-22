#!/bin/bash
# Local development deployment script to deploy both

echo "🚀 Starting SpeechBridge local development..."
echo ""
echo "Starts: FastAPI (8001), Vite (5173), Convex dev. Ctrl+C stops all."
echo ""

trap 'echo ""; echo "🛑 Shutting down..."; kill 0; exit 0' INT TERM

echo "📦 Starting Backend (port 8001)..."
# Prefer project venv (run once: cd backend && python3 -m venv .venv && .venv/bin/pip install -e .)
if [ -x backend/.venv/bin/uvicorn ]; then
  (cd backend && .venv/bin/uvicorn api.main:app --reload --port 8001) &
else
  (cd backend && uvicorn api.main:app --reload --port 8001) &
fi
BACKEND_PID=$!

echo "⚛️  Starting Frontend (port 5173)..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo "🗄️  Starting Convex (frontend directory)..."
(cd frontend && npx convex dev) &
CONVEX_PID=$!
 
echo ""
echo "✅ Services running:"
echo "   Backend:  http://localhost:8001"
echo "   Frontend: http://localhost:5173"
echo "   Convex:   https://dashboard.convex.dev"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""
 
wait
