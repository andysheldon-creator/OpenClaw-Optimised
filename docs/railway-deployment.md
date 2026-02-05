# Moltbot Railway Deployment Guide

## Overview

This document describes how to deploy Moltbot Gateway on Railway (or similar cloud container platforms) with secure remote pairing support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Railway Container (Moltbot Gateway)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Gateway Server                                      │   │
│  │  ├── WebSocket: ws://0.0.0.0:8080                   │   │
│  │  ├── Control UI: /                                  │   │
│  │  └── HTTP API: /.moltbot/hooks/*                    │   │
│  └─────────────────────────────────────────────────────┘   │
│           ▲                              ▲                  │
│           │                              │                  │
│    Device Pairing                 Remote Pairing           │
│    (requires CLI)                 (HTTP API)               │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│ Local Machine        │      │ Remote Admin                 │
│ moltbot pairing      │      │ curl -H "Authorization:..."  │
│ approve <requestId>  │      │ POST /pairing/approve        │
└──────────────────────┘      └──────────────────────────────┘
```

## Security Model

### Threat Model

| Attacker Capability | With Gateway Token Only | With Device Pairing |
|---------------------|-------------------------|---------------------|
| Send messages to connected channels | ✅ Yes | ❌ No |
| Read conversation history | ✅ Yes | ❌ No |
| Execute approved commands | ✅ Yes | ❌ No |
| Access agent workspace files | ✅ Yes | ❌ No |
| Approve new device pairings | ❌ No | ❌ No (requires admin secret) |
| Execute shell commands | ❌ No | ❌ No (exec approval required) |
| Access provider API keys | ❌ No | ❌ No (encrypted) |

**Device pairing prevents**: An attacker who obtains the gateway token cannot:
1. Connect new devices without admin approval
2. Escalate privileges beyond what's paired
3. Persist access if the token is rotated

### Remote Pairing Approval Security

The remote pairing approval endpoint uses:
- **Authorization header only** - secret never in JSON body
- **HMAC signature** - prevents request tampering
- **Timestamp + nonce** - prevents replay attacks
- **Rate limiting** - prevents brute force

## ⚠️ CRITICAL: Volume Mount Required

Railway deployments **MUST** have a persistent volume mounted at `/data`. Without this:
- Device pairing approvals will be lost on container restart
- Session data will be ephemeral  
- Gateway will require re-pairing after each deployment
- **Pairing will appear to work but fail on reconnect**

### Railway Dashboard Setup

1. Go to your Railway service → **Settings** → **Volumes**
2. Click **New Volume**
3. Set **Mount Path**: `/data`
4. Set **Size**: 1GB minimum (recommended: 5GB)
5. Deploy/redeploy the service

### Automatic Configuration (railway.json)

This repository includes a [`railway.json`](railway.json) file that automatically configures the volume mount:

```json
{
  "volumes": [
    {
      "mountPath": "/data",
      "sizeGB": 1
    }
  ]
}
```

If you're deploying from this repo, Railway should automatically detect and use this configuration.

## Configuration

### Required Environment Variables

```bash
# Gateway authentication (required)
CLAWDBOT_GATEWAY_TOKEN=your-secure-random-token-min-32-chars

# Remote pairing admin secret (required for Railway)
CLAWDBOT_PAIRING_ADMIN_SECRET=your-secure-random-secret-min-32-chars

# Server binding (Railway sets these)
PORT=8080
HOST=0.0.0.0

# State persistence ( Railway ephemeral disk workaround)
CLAWDBOT_STATE_DIR=/data/.clawdbot
CLAWDBOT_CONFIG_DIR=/data/.clawdbot
```

### Railway `railway.json` Config

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "variables": {
    "CLAWDBOT_GATEWAY_TOKEN": "${{secrets.GATEWAY_TOKEN}}",
    "CLAWDBOT_PAIRING_ADMIN_SECRET": "${{secrets.PAIRING_ADMIN_SECRET}}",
    "CLAWDBOT_STATE_DIR": "/data/.clawdbot",
    "CLAWDBOT_CONFIG_DIR": "/data/.clawdbot"
  },
  "mounts": {
    "src": "/data",
    "dst": "/data"
  }
}
```

### Minimal `moltbot.json` Config

```json
{
  "gateway": {
    "mode": "local",
    "bind": "0.0.0.0",
    "auth": {
      "mode": "token"
    }
  },
  "hooks": {
    "enabled": true,
    "token": "${CLAWDBOT_GATEWAY_TOKEN}"
  }
}
```

## Deployment Steps

### 1. Generate Secrets

```bash
# Generate gateway token (32+ chars)
openssl rand -hex 32

# Generate pairing admin secret (32+ chars)
openssl rand -hex 32
```

### 2. Configure Railway

1. Create new Railway project
2. Add environment variables:
   - `CLAWDBOT_GATEWAY_TOKEN` = generated token
   - `CLAWDBOT_PAIRING_ADMIN_SECRET` = generated secret
3. Add volume mount for `/data`
4. Deploy

### 3. Initial Pairing (Minimal Steps)

After deployment, the Control UI will show "Pairing Required" because device pairing is enforced. Since you don't have shell access on Railway, use the remote pairing API:

**Step 1: Check logs for the pairing requestId**

In Railway dashboard or CLI, look for this log line:
```
device pair requested requestId=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx deviceId=... role=operator remoteIp=...
```

Or query the pending endpoint:
```bash
curl -H "Authorization: Bearer $CLAWDBOT_PAIRING_ADMIN_SECRET" \
  "https://your-app.up.railway.app/.moltbot/pairing/pending"
```

**Step 2: Approve the pairing (simple method - no HMAC required)**

```bash
curl -X POST "https://your-app.up.railway.app/.moltbot/pairing/approve" \
  -H "Authorization: Bearer $CLAWDBOT_PAIRING_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"requestId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}'
```

**Step 3: Refresh the Control UI**

Your browser session should now be paired and connected.

---

### Alternative: HMAC-Signed Approval (More Secure)

For production use with HMAC signature verification:

```bash
#!/bin/bash
# approve-pairing.sh

REQUEST_ID=$1
SECRET=$2
URL=$3

TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -hex 16)
PAYLOAD="{\"requestId\":\"$REQUEST_ID\"}"
SIGNATURE=$(echo -n "$TIMESTAMP.$NONCE.$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST "$URL/.moltbot/pairing/approve" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -H "X-Moltbot-Timestamp: $TIMESTAMP" \
  -H "X-Moltbot-Nonce: $NONCE" \
  -H "X-Moltbot-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Control UI Usage

### First Login

1. Open `https://your-app.up.railway.app/?token=YOUR_GATEWAY_TOKEN`
2. You'll see "Device Pairing Required"
3. The UI shows pending requests at the bottom
4. Enter your admin secret in Settings (top-right gear icon)
5. Click "Approve" next to your device
6. Refresh - you're now connected!

### Settings Panel

```
Settings
├── Pairing
│   ├── Admin Secret: [************]
│   └── Auto-approve: [ ]
├── Gateway
│   └── Token: [************]
└── Security
    └── Require HMAC: [x]
```

## Troubleshooting

### Finding the requestId

**Option 1: Check Gateway Logs**
Look for this log line in Railway logs:
```
device pair requested requestId=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx deviceId=... role=operator remoteIp=...
```

**Option 2: Query Pending Endpoint**
```bash
curl -H "Authorization: Bearer $CLAWDBOT_PAIRING_ADMIN_SECRET" \
  "https://your-app.up.railway.app/.moltbot/pairing/pending"
```

Response:
```json
{
  "ok": true,
  "pending": [
    {
      "requestId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "deviceId": "...",
      "displayName": "Chrome on Windows",
      "platform": "web",
      "role": "operator",
      "remoteIp": "...",
      "ts": 1234567890,
      "isRepair": false
    }
  ]
}
```

### Permission Denied on /data

Railway's filesystem is ephemeral. Use:

```bash
# Ensure directories exist
mkdir -p /data/.clawdbot
chmod 700 /data/.clawdbot

# Set environment
export CLAWDBOT_STATE_DIR=/data/.clawdbot
export CLAWDBOT_CONFIG_DIR=/data/.clawdbot
```

### Pairing Requests Not Appearing

Check logs for device pairing events:

```bash
# Railway logs
railway logs -t | grep -i pair
```

### 401 Unauthorized on Approval

1. Verify admin secret matches `CLAWDBOT_PAIRING_ADMIN_SECRET`
2. Check HMAC signature format
3. Ensure timestamp is within 5 minutes

## Security Recommendations

1. **Use strong secrets**: 32+ random characters each
2. **Enable HTTPS**: Railway provides this by default
3. **Rotate secrets periodically**: Generate new tokens quarterly
4. **Monitor pairing requests**: Unexpected approvals indicate compromise
5. **Limit admin secret exposure**: Use CI/CD secrets, not hardcoded values
6. **Audit logs**: Review pairing approvals in gateway logs

## Alternative: Disable Device Auth (Not Recommended)

For development/testing only:

```json
{
  "gateway": {
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true
    }
  }
}
```

**⚠️ WARNING**: This disables all device identity checks. Only use in isolated development environments.
