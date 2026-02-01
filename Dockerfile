FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

# Install gosu for dropping privileges at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Entrypoint: fix volume permissions, bootstrap config, drop to node user
COPY <<'ENTRY' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -e

STATE_DIR="${OPENCLAW_STATE_DIR:-/home/node/.openclaw}"
WORK_DIR="${OPENCLAW_WORKSPACE_DIR:-}"

# Ensure state dir exists and is writable by node
mkdir -p "$STATE_DIR"
chown -R node:node "$STATE_DIR"

# Ensure workspace dir exists and is writable by node (if set)
if [ -n "$WORK_DIR" ]; then
  mkdir -p "$WORK_DIR"
  chown -R node:node "$WORK_DIR"
fi

# Bootstrap minimal config if missing
if [ ! -f "$STATE_DIR/openclaw.json" ]; then
  echo '{"gateway":{"mode":"local","bind":"lan"}}' > "$STATE_DIR/openclaw.json"
  chown node:node "$STATE_DIR/openclaw.json"
fi

# Drop to node user and exec CMD
exec gosu node "$@"
ENTRY
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "OPENCLAW_GATEWAY_PORT=${PORT:-18789} exec node dist/index.js gateway run --bind lan --allow-unconfigured"]
