---
name: garmin-connect
description: Access Garmin Connect fitness data (activities, health metrics, training status) for workout advice.
homepage: https://connect.garmin.com
metadata:
  {
    "openclaw":
      {
        "emoji": "⌚",
        "requires": { "bins": ["python3"], "env": [] },
      },
  }
---

# Garmin Connect

Access Garmin Connect data for fitness advice, workout analysis, and training recommendations.

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

List recent activities (default: 7 days):

```bash
{baseDir}/scripts/garmin.py activities
{baseDir}/scripts/garmin.py activities --days 14
{baseDir}/scripts/garmin.py activities --type running
{baseDir}/scripts/garmin.py activities --type strength_training
```

### Activity Details

Get detailed info about a specific activity:

```bash
{baseDir}/scripts/garmin.py activity <activity_id>
{baseDir}/scripts/garmin.py activity <activity_id> --splits  # Include lap data
{baseDir}/scripts/garmin.py activity <activity_id> --hr-zones  # Heart rate zones
```

### Running Stats

Get running-specific metrics (VO2 max, race predictions, etc.):

```bash
{baseDir}/scripts/garmin.py running
```

### Strength Training

Get recent strength workouts with exercises and sets:

```bash
{baseDir}/scripts/garmin.py strength
{baseDir}/scripts/garmin.py strength --days 30
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

Get personal records across activities:

```bash
{baseDir}/scripts/garmin.py records
```

### Goals

Get active fitness goals:

```bash
{baseDir}/scripts/garmin.py goals
```

## Output Formats

All commands support JSON output for programmatic use:

```bash
{baseDir}/scripts/garmin.py status --json
{baseDir}/scripts/garmin.py activities --json
```

## Credentials

Credentials are stored in `~/.garminconnect/` after first login.
To re-authenticate:

```bash
{baseDir}/scripts/garmin.py login
```

## Configuration

Optional: Store email in OpenClaw config (`~/.openclaw/openclaw.json`):

```json5
{
  skills: {
    entries: {
      "garmin-connect": {
        config: {
          email: "your.email@example.com"
        }
      }
    }
  }
}
```

Password is always prompted or read from `GARMIN_PASSWORD` env var.

## Tips for Workout Advice

When advising on workouts, consider:

1. **Training Readiness** — Check `training` command before suggesting intensity
2. **Body Battery** — Low battery = recovery day
3. **Sleep Quality** — Poor sleep = reduce volume/intensity
4. **Training Load** — Balance anaerobic vs aerobic load
5. **HRV Trends** — Declining HRV = accumulated fatigue
6. **Recent Activities** — Avoid back-to-back high-intensity days

## Supported Activity Types

Common types for filtering:
- `running`
- `cycling`
- `strength_training`
- `walking`
- `hiking`
- `swimming`
- `yoga`
- `indoor_cardio`
