# Deploy Clawdbot on Railway

This guide walks you through deploying your personal Clawdbot instance on [Railway.app](https://railway.app) with Gemini API support.

## Why Railway?

- **Easy Deployment**: Git-based deployments with automatic Docker builds
- **Free Tier**: $5/month credit (hobby plan)
- **Persistent Storage**: Volume support for WhatsApp sessions and agent data
- **Environment Management**: Simple environment variable configuration
- **India-Friendly**: Good global network with low latency

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
3. **GitHub Repository**: Fork or clone this repo to your GitHub account
4. **WhatsApp Number**: Real Indian mobile number (Jio/Airtel/Vi recommended)

## Cost Estimate

- **Railway Hobby Plan**: $5/month credit (includes)
  - ~500MB RAM usage
  - Persistent storage (up to 100GB)
  - Includes egress bandwidth
- **Gemini API**: Free tier available (60 requests/minute)
- **Total**: Can run completely FREE on Railway's trial + Gemini free tier!

## Step 1: Prepare Your Repository

### Option A: Deploy This Fork Directly

If you're already in your fork:

```bash
# Make sure you're on the main branch
git checkout main

# Verify railway.toml exists
ls railway.toml

# Push to your fork if not already there
git push origin main
```

### Option B: Fork the Original Repository

1. Go to [github.com/clawdbot/clawdbot](https://github.com/clawdbot/clawdbot)
2. Click "Fork" in the top right
3. Clone your fork locally

## Step 2: Create Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"**
3. Select your clawdbot repository (authorize GitHub if needed)
4. Railway will automatically detect the `Dockerfile` and `railway.toml`

## Step 3: Add Persistent Volumes

Railway needs volumes to persist data across deployments:

1. In your Railway project, click on your service
2. Go to **"Settings"** tab
3. Scroll to **"Volumes"**
4. Add TWO volumes:

**Volume 1: Configuration & Sessions**
- **Mount Path**: `/home/node/.clawdbot`
- **Size**: 5GB (recommended)
- This stores: config, WhatsApp sessions, credentials

**Volume 2: Agent Workspace**
- **Mount Path**: `/home/node/clawd`
- **Size**: 10GB (recommended)
- This stores: agent workspaces, memories, skills

## Step 4: Configure Environment Variables

In Railway dashboard → **Variables** tab, add these:

### Required Variables

```bash
# Your Gemini API Key from Google AI Studio
GEMINI_API_KEY=AIzaSy...your_actual_key...

# Generate a secure random token for gateway auth
CLAWDBOT_GATEWAY_TOKEN=your_secure_random_token_here
```

**To generate a secure token:**
```bash
# On your local machine
openssl rand -hex 32
# Copy the output as CLAWDBOT_GATEWAY_TOKEN
```

### Optional Variables

```bash
# Gateway port (Railway auto-assigns, but you can set a default)
CLAWDBOT_GATEWAY_PORT=18789

# For debugging (remove in production)
CLAWDBOT_LOG_LEVEL=info

# Timezone (optional)
TZ=Asia/Kolkata
```

## Step 5: Deploy!

1. Click **"Deploy"** in Railway dashboard
2. Watch the build logs (takes ~5-10 minutes first time)
3. Wait for status to show **"Active"**

## Step 6: Get Your Railway URL

1. In Railway dashboard, go to **"Settings"**
2. Scroll to **"Networking"**
3. Click **"Generate Domain"**
4. You'll get a URL like: `your-app.railway.app`
5. Save this URL - you'll need it to connect!

## Step 7: Initial Configuration

Railway doesn't provide SSH, so we'll configure via Railway CLI:

### Install Railway CLI

```bash
# macOS/Linux
curl -fsSL https://railway.app/install.sh | sh

# Or via npm
npm install -g @railway/cli
```

### Login and Connect

```bash
# Login to Railway
railway login

# Link to your project
railway link
```

### Run Initial Configuration

```bash
# Connect to your Railway instance
railway run bash

# Inside the container, run onboarding
node dist/index.js onboard \
  --non-interactive \
  --auth-choice gemini-api-key \
  --mode local \
  --gateway-port 18789 \
  --gateway-bind lan \
  --no-install-daemon

# Exit the container
exit
```

### Alternative: Manual Configuration

Create `~/.clawdbot/clawdbot.json` locally, then upload:

```json5
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-3-pro"
      },
      "workspace": "~/clawd"
    }
  },
  "whatsapp": {
    "enabled": true,
    "dmPolicy": "pairing"
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "lan",
    "token": "${CLAWDBOT_GATEWAY_TOKEN}"
  }
}
```

Upload to Railway:
```bash
railway run bash
# Inside container:
mkdir -p /home/node/.clawdbot
cat > /home/node/.clawdbot/clawdbot.json
# Paste the JSON above, then Ctrl+D
exit
```

## Step 8: Connect WhatsApp

### Via Railway CLI (Recommended)

```bash
# Connect to Railway and link WhatsApp
railway run node dist/index.js providers login
```

This will show a QR code. Scan it with WhatsApp:
1. Open WhatsApp on your phone
2. Go to **Settings → Linked Devices**
3. Tap **"Link a Device"**
4. Scan the QR code

### Via Local CLI Pointing to Railway

Install clawdbot locally:
```bash
npm install -g clawdbot
```

Create local config to point to Railway:
```bash
mkdir -p ~/.clawdbot
cat > ~/.clawdbot/clawdbot.json <<EOF
{
  "gateway": {
    "mode": "remote",
    "url": "wss://your-app.railway.app",
    "token": "your_gateway_token_here"
  }
}
EOF
```

Link WhatsApp:
```bash
clawdbot providers login
```

## Step 9: Verify Deployment

Check if everything is running:

```bash
# Via Railway CLI
railway run node dist/index.js status

# Or via local CLI (if configured for remote)
clawdbot status
```

You should see:
- ✅ Gateway: Running
- ✅ WhatsApp: Connected
- ✅ Agent: Ready

## Step 10: Send Test Message

Test your deployment:

```bash
# Via Railway CLI
railway run node dist/index.js message send \
  --to "+91XXXXXXXXXX" \
  --message "Hello from Railway!"

# Or just message your bot via WhatsApp!
```

## Security Configuration

### Lock Down WhatsApp Access

Edit your config to only accept messages from YOUR number:

```bash
railway run bash
# Inside container:
cat > /home/node/.clawdbot/clawdbot.json <<'EOF'
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-3-pro"
      },
      "workspace": "~/clawd"
    }
  },
  "whatsapp": {
    "dmPolicy": "allowlist",
    "allowFrom": ["+91XXXXXXXXXX"]  // Your Indian number
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "lan"
  }
}
EOF
exit
```

Restart the service in Railway dashboard.

### Enable Sandboxing for Groups

If you add your bot to WhatsApp groups, enable sandboxing:

```json5
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "none"
      }
    }
  }
}
```

## Monitoring & Logs

### View Real-Time Logs

```bash
# Via Railway dashboard
# Click on your service → "Deployments" → "View Logs"

# Or via CLI
railway logs --follow
```

### Health Checks

```bash
# Check health status
railway run node dist/index.js health

# Deep probe
railway run node dist/index.js status --deep
```

### Check WhatsApp Connection

```bash
railway run node dist/index.js providers status
```

## Troubleshooting

### WhatsApp Won't Connect

```bash
# Check provider status
railway run node dist/index.js providers status

# Relink WhatsApp
railway run node dist/index.js providers login
```

### Gateway Not Responding

1. Check Railway logs for errors
2. Verify volumes are mounted correctly
3. Ensure `GEMINI_API_KEY` is set
4. Verify `CLAWDBOT_GATEWAY_TOKEN` matches

### Out of Memory

Railway hobby plan has memory limits. If you hit them:
1. Upgrade to pro plan ($5-20/month)
2. Or reduce concurrent requests in config:

```json5
{
  "agents": {
    "defaults": {
      "maxConcurrency": 1
    }
  }
}
```

### WhatsApp Disconnects Frequently

Railway restarts services occasionally. WhatsApp should auto-reconnect, but if not:
1. Check `/home/node/.clawdbot` volume is persistent
2. Relink WhatsApp if needed
3. Consider upgrading Railway plan for better stability

## Updating Your Deployment

When you push to your GitHub repo, Railway auto-deploys:

```bash
# On your local machine
git pull origin main
git add .
git commit -m "Update configuration"
git push origin main

# Railway will automatically rebuild and deploy
```

## Cost Breakdown (India)

### Railway Costs
- **Hobby Plan**: $5/month credit
  - Includes compute, storage, bandwidth
  - Should cover personal use completely
- **Pro Plan**: $20/month (if you exceed hobby limits)

### Gemini API Costs
- **Free Tier**: 60 requests/minute (generous for personal use)
- **Paid Tier**: If needed, very competitive pricing

### Estimated Monthly Cost
- **Light Use** (50-100 msgs/day): FREE (within Railway + Gemini free tiers)
- **Moderate Use** (500 msgs/day): $5-10/month
- **Heavy Use** (1000+ msgs/day): $15-30/month

## Advanced: Using Multiple Models

Clawdbot supports multiple models. You can mix Gemini with others:

```json5
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-3-pro",
        "reasoning": "google/gemini-3-pro",
        "fast": "google/gemini-3-flash"
      }
    }
  }
}
```

Add environment variables in Railway for other providers:
- `OPENAI_API_KEY` - For GPT models
- `ANTHROPIC_API_KEY` - For Claude models
- `OPENROUTER_API_KEY` - For multi-model access

## Railway-Specific Tips

1. **Volumes are persistent**: Data survives redeploys
2. **Auto-restart**: Railway restarts on crashes (good for WhatsApp)
3. **Build cache**: Subsequent deploys are faster (~2-3 minutes)
4. **Environment changes**: Require redeploy to take effect
5. **Logs retention**: Railway keeps logs for 7 days

## Getting Help

- **Clawdbot Docs**: https://docs.clawd.bot
- **Railway Docs**: https://docs.railway.app
- **Discord**: https://discord.gg/clawd
- **GitHub Issues**: https://github.com/clawdbot/clawdbot/issues

## Next Steps

Once deployed:
1. ✅ Test basic messaging via WhatsApp
2. ✅ Configure security (allowlists, sandboxing)
3. ✅ Set up Telegram/Discord (optional)
4. ✅ Create custom skills and prompts
5. ✅ Back up your configuration regularly

Enjoy your personal AI assistant running on Railway! 🚂✨
