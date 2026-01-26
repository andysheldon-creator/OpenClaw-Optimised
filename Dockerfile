FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG CLAWDBOT_DOCKER_APT_PACKAGES=""
RUN if [ -n "$CLAWDBOT_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $CLAWDBOT_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV CLAWDBOT_PREFER_PNPM=1
RUN pnpm ui:install
RUN pnpm ui:build

ENV NODE_ENV=production

# Install gosu for dropping privileges safely
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*

# Entrypoint script: fix /data permissions, create Railway config, then drop to node user
RUN printf '#!/bin/sh\n\
if [ -d /data ]; then\n\
  chown -R node:node /data 2>/dev/null || true\n\
fi\n\
# Create initial config with trustedProxies for Railway/cloud deployments\n\
if [ -n "$CLAWDBOT_STATE_DIR" ] && [ ! -f "$CLAWDBOT_STATE_DIR/clawdbot.json" ]; then\n\
  mkdir -p "$CLAWDBOT_STATE_DIR"\n\
  cat > "$CLAWDBOT_STATE_DIR/clawdbot.json" << EOF\n\
{\n\
  "gateway": {\n\
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"]\n\
  }\n\
}\n\
EOF\n\
  chown node:node "$CLAWDBOT_STATE_DIR/clawdbot.json"\n\
fi\n\
exec gosu node "$@"\n' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
