#!/bin/bash

echo "🚀 Starting SpeechBridge local development..."
echo ""

trap 'echo ""; echo "🛑 Shutting down..."; kill 0; exit 0' INT TERM

echo "📦 Starting Backend (port 8000)..."
cd backend && uvicorn api.main:app --reload --port 8000 &
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
