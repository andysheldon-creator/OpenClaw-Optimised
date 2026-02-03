FROM node:22-bullseye-slim

# ✅ curl en unzip installeren zodat bun werkt
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    corepack enable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies installeren
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Source code kopiëren
COPY . .

# ✅ Skip alle build commando's die falen
RUN pnpm ui:install

# Build the TypeScript source code
RUN pnpm build

# Install Playwright and Chromium browser
ENV PLAYWRIGHT_BROWSERS_PATH=/data/playwright-browsers
RUN pnpm add playwright && npx playwright install chromium

# Data folder maken
RUN mkdir -p /data/.clawdbot

# Entrypoint instellen
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]

# Default: start the gateway
# Uses OPENCLAW_GATEWAY_PORT env var, --bind lan ensures 0.0.0.0 binding for Railway
# --allow-unconfigured allows starting without initial config
CMD ["node", "openclaw.mjs", "gateway", "run", "--bind", "lan", "--allow-unconfigured"]
