# =============================================================================
# Stage 1: Builder
# Install dependencies, build the application, then discard source code.
# =============================================================================
FROM node:22-bookworm AS builder

# SECURITY: Pin Bun version to prevent supply chain attacks via version drift.
# Verify the download source using HTTPS and a pinned version tag.
ARG BUN_VERSION="1.2.4"
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

# SECURITY: Optional apt packages — validated and documented as user responsibility.
# WARNING: Only install packages you trust. These run as root during build.
# Package names are validated against a strict character allowlist.
ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      echo "⚠️  SECURITY: Installing custom apt packages: $OPENCLAW_DOCKER_APT_PACKAGES" && \
      for pkg in $OPENCLAW_DOCKER_APT_PACKAGES; do \
        if ! echo "$pkg" | grep -qE '^[a-zA-Z0-9][a-zA-Z0-9.+\-]+$'; then \
          echo "❌ SECURITY: Invalid package name rejected: $pkg" && exit 1; \
        fi; \
      done && \
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
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

# =============================================================================
# Stage 2: Runtime
# Minimal production image — no source code, no build tools.
# =============================================================================
FROM node:22-bookworm-slim AS runtime

# SECURITY: Install only runtime dependencies.
# The slim image has a significantly smaller attack surface.
RUN corepack enable

WORKDIR /app

# Copy only production artifacts from the builder stage.
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/patches ./patches
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openclaw.mjs ./openclaw.mjs
COPY --from=builder /app/ui/dist ./ui/dist
COPY --from=builder /app/ui/package.json ./ui/package.json
COPY --from=builder /app/ui/node_modules ./ui/node_modules

# Copy extension directories if they exist (they contain runtime plugins)
COPY --from=builder /app/extensions ./extensions

# Copy docs for runtime reference (optional, but needed for help commands)
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/i18n ./i18n

ENV NODE_ENV=production

# Allow non-root user to write temp files during runtime.
RUN chown -R node:node /app

# Security hardening: Run as non-root user.
# The node:22-bookworm-slim image includes a 'node' user (uid 1000).
# This reduces the attack surface by preventing container escape via root privileges.
USER node

# Start gateway server with default config.
# Binds to loopback (127.0.0.1) by default for security.
#
# For container platforms requiring external health checks:
#   1. Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD env var
#   2. Override CMD: ["node","openclaw.mjs","gateway","--allow-unconfigured","--bind","lan"]
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
