#!/bin/bash
# start-mission-control.sh

cd "$(dirname "$0")"

# Check if already running
if lsof -i :3000 > /dev/null 2>&1; then
  echo "Mission Control already running on http://localhost:3000"
  exit 0
fi

echo "Starting Mission Control..."
echo "Dashboard: http://localhost:3000"
echo "API: http://localhost:3000/api/tasks"
echo ""
echo "Using database: ~/.openclaw/workspace-dev/data/mission_control.db"
echo ""

npm run dev
