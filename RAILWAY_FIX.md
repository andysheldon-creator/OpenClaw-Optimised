# Railway Deployment Fix

## Problem
Railway deployment was failing with error: `mkdir: cannot create directory '/data/.openclaw': Permission denied`

## Root Cause Analysis

1. **Volume permission issue**: Railway mounts the `/data` volume at runtime with root ownership. The container runs as `node` user (non-root) and cannot write to the mounted volume.
2. **Build-time chown ineffective**: The Dockerfile's `RUN chown -R node:node /data` runs at build time, but Railway mounts the volume at runtime, overwriting ownership.
3. **Port mapping**: Railway sets `PORT` env var, but OpenClaw expects `OPENCLAW_GATEWAY_PORT` or `CLAWDBOT_GATEWAY_PORT`

## Solution

### 1. Updated `docker-entrypoint.sh`
- Creates config as root (before dropping privileges)
- Runs `chown -R node:node /data` at runtime to fix volume permissions
- Uses `su node -c "..."` to exec the gateway as the node user

### 2. Updated `Dockerfile`
- Removed build-time `chown` (ineffective for Railway volumes)
- Kept `USER node` for security hardening

### 2. Updated `Dockerfile`
- Copies and makes the entrypoint script executable
- Changed from `CMD` to `ENTRYPOINT` to use the shell script
- Ensures proper port handling for Railway deployments

### 3. Updated `package.json`
- Changed the `start` script to run the gateway command with proper port handling
- Uses `${PORT:-8080}` to default to 8080 if PORT is not set

### 4. Updated `railway.json`
- Removed the `startCommand` override (now handled by Dockerfile ENTRYPOINT)
- Kept the volume mount, health check, and restart policy configuration

## Files Changed

1. **docker-entrypoint.sh** (new)
   - Shell script that maps PORT to OPENCLAW_GATEWAY_PORT
   - Runs the gateway server with correct CLI command

2. **Dockerfile**
   - Copies entrypoint script and makes it executable
   - Uses ENTRYPOINT instead of CMD

3. **package.json**
   - Updated `start` script to run gateway command

4. **railway.json**
   - Removed redundant `startCommand`

## Testing

To test locally with Docker:

```bash
# Build the image
docker build -t openclaw-test .

# Run with Railway-like PORT env var
docker run -p 8080:8080 -e PORT=8080 -e CLAWDBOT_GATEWAY_TOKEN=test-token openclaw-test

# Verify it's running
curl http://localhost:8080/health
```

## Deployment

After pushing these changes to Railway:
1. Railway will rebuild using the Dockerfile
2. The entrypoint script will map PORT to OPENCLAW_GATEWAY_PORT
3. The gateway server will start on the correct port
4. Health checks should pass at `/health`

## Environment Variables Required

Make sure these are set in Railway:
- `CLAWDBOT_GATEWAY_TOKEN` - Gateway authentication token
- `CLAWDBOT_PAIRING_ADMIN_SECRET` - Admin secret for remote pairing
- `CLAWDBOT_STATE_DIR=/data/.clawdbot` - State directory (uses volume mount)
- `CLAWDBOT_CONFIG_DIR=/data/.clawdbot` - Config directory (uses volume mount)

Railway automatically sets:
- `PORT` - The port the service should listen on (mapped by entrypoint script)
