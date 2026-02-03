# Multi-stage build for OpenClaw Docker image
# Stage 1: Builder
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Stage 2: Runtime
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    git \
    curl \
    tzdata \
    ca-certificates

# Copy OpenClaw from builder
COPY --from=builder /usr/local/lib/node_modules/openclaw /usr/local/lib/node_modules/openclaw
COPY --from=builder /usr/local/bin/openclaw /usr/local/bin/openclaw

# Create symbolic link for gateway
RUN ln -sf /usr/local/lib/node_modules/openclaw/dist/index.js /usr/local/bin/openclaw

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

# Start gateway server with default config.
# Binds to loopback (127.0.0.1) by default for security.
#
# For container platforms requiring external health checks:
#   1. Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD env var
#   2. Override CMD: ["node","dist/index.js","gateway","--allow-unconfigured","--bind","lan"]
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured"]
