#!/bin/bash
# Auto-starts Mission Control as companion to OpenClaw Gateway

set -e

MC_DIR="/Users/claw/.openclaw/workspace/rifthome/mission-control"
PID_FILE="/tmp/mission-control.pid"
PORT=3000

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}[Mission Control]${NC} Starting companion service..."

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo -e "${YELLOW}[Mission Control]${NC} Already running on http://localhost:$PORT"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# Check port availability
if lsof -i :$PORT > /dev/null 2>&1; then
  echo -e "${YELLOW}[Mission Control]${NC} Port $PORT in use, checking if it's us..."
  sleep 1
fi

# Verify MC exists
if [ ! -d "$MC_DIR" ]; then
  echo -e "${RED}[Mission Control]${NC} Directory not found: $MC_DIR"
  exit 1
fi

# Check env file
if [ ! -f "$MC_DIR/.env" ]; then
  echo -e "${YELLOW}[Mission Control]${NC} .env not found, creating from template..."
  if [ -f "$MC_DIR/.env.example" ]; then
    cp "$MC_DIR/.env.example" "$MC_DIR/.env"
    echo -e "${YELLOW}[Mission Control]${NC} Created .env - YOU MUST EDIT IT with your tokens!"
  fi
fi

cd "$MC_DIR"

# Check node_modules
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}[Mission Control]${NC} Installing dependencies..."
  npm install
fi

# Check if dist exists
if [ ! -d "dist" ]; then
  echo -e "${BLUE}[Mission Control]${NC} Building..."
  npm run build
fi

echo -e "${GREEN}[Mission Control]${NC} Starting server..."
echo -e "${GREEN}[Mission Control]${NC} Dashboard: http://localhost:$PORT"
echo -e "${GREEN}[Mission Control]${NC} API: http://localhost:$PORT/api/tasks"

# Start in background
npm run start > /tmp/mission-control.log 2>&1 &
MC_PID=$!
echo $MC_PID > "$PID_FILE"

# Wait for it to start
sleep 2
if kill -0 $MC_PID 2>/dev/null; then
  echo -e "${GREEN}[Mission Control]${NC} ✓ Started successfully (PID: $MC_PID)"
else
  echo -e "${RED}[Mission Control]${NC} ✗ Failed to start. Check logs: /tmp/mission-control.log"
  rm -f "$PID_FILE"
  exit 1
fi
