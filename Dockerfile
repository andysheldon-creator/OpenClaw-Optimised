# Builder: full environment, build tools and dev deps only here
FROM node:22-bookworm AS builder
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app

# Install Bun and enable corepack (builder only)
RUN curl -fsSL https://bun.sh/install | bash
RUN corepack enable

# Optional APT packages for build (builder only)
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Install dependencies (dev + prod) for build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Copy source and build application & UI
COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

# Convert to production dependencies only
# pnpm prune --prod is preferred, fallback to reinstalling prod deps if needed
RUN pnpm prune --prod || pnpm install --frozen-lockfile --prod --no-optional

# Clean build caches to keep layers small
RUN pnpm store prune || true && rm -rf /root/.bun /root/.cache/pnpm /tmp/*

# Runtime: minimal Debian-slim image with only runtime artifacts
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only runtime artifacts and set ownership during copy to avoid an extra layer
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Use non-root node user that exists in the base image
USER node

# Start gateway server with default config
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured"]
