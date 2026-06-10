#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# PRODUCTION PREVIEW — test the exact production build locally
# Uses YOUR LOCAL databases (MariaDB + MongoDB on this machine)
# so production data is never touched.
#
# Usage (from project root):
#   chmod +x prod-preview.sh   ← run once to make executable
#   ./prod-preview.sh
#
# Then open: http://localhost:4000
# ─────────────────────────────────────────────────────────────────────────────

set -e  # exit immediately if any command fails

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Step 1: Build the React frontend ─────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────┐"
echo "│  🔨  Building React frontend...     │"
echo "└─────────────────────────────────────┘"

cd "$SCRIPT_DIR/frontend"
# VITE_API_BASE_URL="" → tells the built app to call /api on the SAME host
# (localhost:4000), NOT the live VPS URL
VITE_API_BASE_URL="" npm run build

echo ""
echo "✅  Frontend built → frontend/dist/"

# ── Step 2: Start backend in production mode ──────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  🚀  Starting backend in PRODUCTION mode...             │"
echo "│                                                         │"
echo "│  Open your browser →  http://localhost:4000             │"
echo "│  Press Ctrl+C to stop                                   │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""

cd "$SCRIPT_DIR/backend"

# ── Kill anything already using port 4000 (e.g. your dev nodemon server) ─────
EXISTING_PID=$(lsof -ti tcp:4000 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "⚠️   Port 4000 is occupied (PID $EXISTING_PID) — stopping it..."
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  echo "✅  Port 4000 is now free"
  echo ""
fi

# NODE_ENV=production        → Express serves built frontend, strict cookies, prod CORS
# SESSION_COOKIE_SECURE=false → lets session cookies work over http://localhost
# SESSION_COOKIE_SAMESITE=lax → prevents server.js from forcing sameSite=none
#   (FRONTEND_URL in .env makes server.js set sameSite=none for cross-origin prod,
#    which then forces secure=true — ignoring SESSION_COOKIE_SECURE=false above.
#    Setting lax here breaks that chain so HTTP cookies actually work locally.)
# All other vars (DB_HOST, MONGO_URI, passwords) come from backend/.env as usual
NODE_ENV=production SESSION_COOKIE_SECURE=false SESSION_COOKIE_SAMESITE=lax TRUST_PROXY=false node server.js
