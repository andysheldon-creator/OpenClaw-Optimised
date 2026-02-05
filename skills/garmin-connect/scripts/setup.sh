#!/bin/bash
#
# Setup script for Garmin Connect skill
# Installs dependencies and optionally authenticates
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_DIR="$HOME/.garminconnect"

echo "⌚ Garmin Connect Skill Setup"
echo "=============================="
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ python3 not found. Please install Python 3.8+."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✓ Python $PYTHON_VERSION found"

# Install garminconnect
echo
echo "Installing garminconnect package..."
python3 -m pip install --user --upgrade garminconnect 2>/dev/null || \
    python3 -m pip install --upgrade garminconnect 2>/dev/null || \
    python3 -m pip install --break-system-packages --upgrade garminconnect

echo "✓ garminconnect installed"

# Make script executable
chmod +x "$SCRIPT_DIR/garmin.py"
echo "✓ garmin.py made executable"

# Check for existing tokens
echo
if [ -d "$TOKEN_DIR" ] && [ -f "$TOKEN_DIR/oauth1_token.json" ]; then
    echo "✓ Existing Garmin tokens found at $TOKEN_DIR"
    echo
    read -p "Re-authenticate? (y/N): " REAUTH
    if [[ ! "$REAUTH" =~ ^[Yy]$ ]]; then
        echo
        echo "Setup complete! Test with:"
        echo "  $SCRIPT_DIR/garmin.py status"
        exit 0
    fi
fi

# Authenticate
echo
echo "Authenticating with Garmin Connect..."
echo "(Credentials are stored locally in $TOKEN_DIR)"
echo

"$SCRIPT_DIR/garmin.py" login

echo
echo "✓ Setup complete!"
echo
echo "Usage examples:"
echo "  $SCRIPT_DIR/garmin.py status       # Training status overview"
echo "  $SCRIPT_DIR/garmin.py activities   # Recent activities"
echo "  $SCRIPT_DIR/garmin.py running      # VO2 max, race predictions"
echo "  $SCRIPT_DIR/garmin.py strength     # Strength workouts"
echo "  $SCRIPT_DIR/garmin.py health       # Daily health metrics"
