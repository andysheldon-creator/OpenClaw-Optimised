FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

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

# Security hardening: Run as non-root user (uid 1000).
# Docker Desktop for Mac may ship empty /etc/passwd; ensure the node user exists.
RUN if ! grep -q '^node:' /etc/passwd 2>/dev/null; then \
      echo 'root:x:0:0:root:/root:/bin/bash' >> /etc/passwd && \
      echo 'node:x:1000:1000::/home/node:/bin/bash' >> /etc/passwd && \
      echo 'root:x:0:' >> /etc/group && \
      echo 'node:x:1000:' >> /etc/group; \
    fi && mkdir -p /home/node && chown 1000:1000 /home/node
USER node

CMD ["node", "dist/index.js"]
