FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
ARG GOGCLI_VERSION=0.9.0
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      file \
      git \
      procps \
      $OPENCLAW_DOCKER_APT_PACKAGES; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    mkdir -p /home/linuxbrew/.linuxbrew; \
    chown -R node:node /home/linuxbrew; \
    curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o /tmp/install-brew.sh; \
    chmod +x /tmp/install-brew.sh; \
    su node -s /bin/bash -c 'NONINTERACTIVE=1 CI=1 /tmp/install-brew.sh'; \
    rm -f /tmp/install-brew.sh; \
    ln -sfn /home/linuxbrew/.linuxbrew/Homebrew/Library /home/linuxbrew/.linuxbrew/Library; \
    printf '%s\n' \
      '#!/bin/sh' \
      'export HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew"' \
      'export HOMEBREW_REPOSITORY="/home/linuxbrew/.linuxbrew/Homebrew"' \
      'export HOMEBREW_CELLAR="/home/linuxbrew/.linuxbrew/Cellar"' \
      'exec /home/linuxbrew/.linuxbrew/bin/brew "$@"' \
      > /usr/local/bin/brew; \
    chmod 755 /usr/local/bin/brew; \
    chown root:root /usr/local/bin/brew

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64|arm64) ;; \
      *) echo "unsupported architecture for gogcli: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/gogcli.tgz "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${arch}.tar.gz"; \
    tar -xzf /tmp/gogcli.tgz -C /tmp; \
    install -m 0755 /tmp/gog /usr/local/bin/gog; \
    rm -f /tmp/gog /tmp/gogcli.tgz; \
    /usr/local/bin/gog --version

ENV HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew
ENV HOMEBREW_REPOSITORY=/home/linuxbrew/.linuxbrew/Homebrew
ENV HOMEBREW_CELLAR=/home/linuxbrew/.linuxbrew/Cellar
ENV PATH="${HOMEBREW_PREFIX}/bin:${HOMEBREW_PREFIX}/sbin:${PATH}"

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

ENV NODE_ENV=production

# Configure npm global installs for non-root runtime user.
RUN mkdir -p /home/node/.npm-global && chown -R node:node /home/node/.npm-global
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH="/home/node/.npm-global/bin:${PATH}"

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

# Preinstall node-backed skill CLIs for portable images.
RUN npm i -g mcporter && mcporter --version

# Start gateway server with default config.
# Binds to loopback (127.0.0.1) by default for security.
#
# For container platforms requiring external health checks:
#   1. Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD env var
#   2. Override CMD: ["node","openclaw.mjs","gateway","--allow-unconfigured","--bind","lan"]
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
