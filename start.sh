#!/bin/bash

# HoloTree - Knowledge Base Startup Script
# ==========================================

cd "$(dirname "$0")"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║      ◈  H O L O T R E E  ◈                               ║"
echo "║      Interactive Knowledge Base                           ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if node_modules exist
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Build frontend if needed
if [ ! -d "backend/public" ] || [ ! -f "backend/public/index.html" ]; then
    echo "🔨 Building frontend..."
    cd frontend && npm run build && cd ..
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/
fi

echo ""
echo "🚀 Starting HoloTree server..."
echo ""
echo "   Open in browser: http://localhost:3001"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

cd backend && node server.js
