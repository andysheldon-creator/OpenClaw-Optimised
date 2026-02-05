---
name: garmin-connect
description: Access Garmin Connect fitness data - activities, health metrics, training status, sleep, stress, and more.
homepage: https://connect.garmin.com
metadata:
  {
    "openclaw":
      {
        "emoji": "⌚",
        "requires": { "bins": ["python3"], "env": [] }
      }
  }
---

# Garmin Connect

Access all Garmin Connect data - activities, health metrics, training status, sleep, and more.

## Setup

First-time setup (installs dependencies and authenticates):

```bash
{baseDir}/scripts/setup.sh
```

This will:
1. Install `garminconnect` Python package
2. Prompt for Garmin credentials (stored securely in `~/.garminconnect`)
3. Tokens are valid for ~1 year

## Commands

### Status Overview

Get current training status, body battery, and readiness:

```bash
{baseDir}/scripts/garmin.py status
```

### Recent Activities

List recent activities (all types):

```bash
{baseDir}/scripts/garmin.py activities
{baseDir}/scripts/garmin.py activities --days 14
{baseDir}/scripts/garmin.py activities --type running
{baseDir}/scripts/garmin.py activities --type cycling
{baseDir}/scripts/garmin.py activities --type swimming
```

### Activity Details

Get detailed info about a specific activity:

```bash
{baseDir}/scripts/garmin.py activity <activity_id>
{baseDir}/scripts/garmin.py activity <activity_id> --splits  # Include lap data
{baseDir}/scripts/garmin.py activity <activity_id> --hr-zones  # Heart rate zones
```

### Health Metrics

Get health data for a specific date:

```bash
{baseDir}/scripts/garmin.py health
{baseDir}/scripts/garmin.py health --date 2026-02-01
```

Includes: steps, heart rate, sleep, stress, body battery, HRV.

### Sleep Data

Get detailed sleep analysis:

```bash
{baseDir}/scripts/garmin.py sleep
{baseDir}/scripts/garmin.py sleep --days 7  # Weekly summary
```

### Training Load & Readiness

Get training load balance and readiness score:

```bash
{baseDir}/scripts/garmin.py training
```

### Personal Records

Get personal records across all activities:

```bash
{baseDir}/scripts/garmin.py records
```

### Goals

Get active fitness goals:

```bash
{baseDir}/scripts/garmin.py goals
```

### Running Metrics (Optional)

Get running-specific metrics (VO2 max, race predictions):

```bash
{baseDir}/scripts/garmin.py running
```

### Strength Training (Optional)

Get strength workouts with exercises and sets:

```bash
{baseDir}/scripts/garmin.py strength
{baseDir}/scripts/garmin.py strength --days 30
```

## Output Formats

All commands support JSON output for programmatic use:

```bash
{baseDir}/scripts/garmin.py status --json
{baseDir}/scripts/garmin.py activities --json
```

## Credentials

Credentials are fetched in this order:
1. **Saved tokens** in `~/.garminconnect/` (valid ~1 year)
2. **Password manager** - Bitwarden or 1Password CLI (if available and unlocked)
3. **Interactive prompt** (last resort)

### Using Bitwarden

```bash
bw unlock                    # Unlock vault first
export BW_SESSION="..."      # Set session from unlock output
{baseDir}/scripts/garmin.py status   # Auto-fetches "garmin" entry
```

### Using 1Password

```bash
op signin                    # Sign in (or use desktop app integration)
{baseDir}/scripts/garmin.py status   # Auto-fetches "Garmin" item
```

### Re-authenticate

```bash
{baseDir}/scripts/garmin.py login
```

## Supported Activity Types

Filter activities with `--type`:
- `running`
- `cycling`
- `swimming`
- `strength_training`
- `walking`
- `hiking`
- `yoga`
- `indoor_cardio`
- `open_water_swimming`
- `trail_running`
- `treadmill_running`
- `virtual_ride`
- `pilates`
- `breathwork`
- `cardio`
- (and many more Garmin activity types)
