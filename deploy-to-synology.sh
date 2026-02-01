#!/bin/bash
set -e

echo "🚀 Deploying OpenClaw to Synology DiskStation..."

# Stop existing container
echo "📦 Stopping existing container..."
ssh root@synology 'cd /docker/openclaw && /usr/local/bin/docker compose down'

# Copy configuration files
echo "📝 Copying configuration files..."
scp docker-compose.yml root@synology:/docker/openclaw/docker-compose.yml

# Rebuild Docker image
echo "🔨 Building Docker image (this will take several minutes)..."
ssh root@synology 'cd /docker/openclaw && /usr/local/bin/docker build -t openclaw:local .'

# Start container
echo "▶️  Starting OpenClaw container..."
ssh root@synology 'cd /docker/openclaw && /usr/local/bin/docker compose up -d'

# Wait for startup
echo "⏳ Waiting for gateway to start..."
sleep 10

# Check status
echo "📊 Checking status..."
ssh root@synology '/usr/local/bin/docker ps | grep openclaw'
ssh root@synology '/usr/local/bin/docker logs --tail 50 openclaw-gateway'

echo ""
echo "✅ Deployment complete!"
echo "🌐 Gateway URL: http://synology.local:18789"
echo "📋 View logs: ssh root@synology '/usr/local/bin/docker logs -f openclaw-gateway'"
