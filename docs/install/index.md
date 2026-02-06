---
summary: "Alternative install methods, deployment options, and maintenance for OpenClaw"
read_when:
  - You need Docker, Nix, from-source, or another non-default install method
  - You want to deploy to a cloud platform
  - You need to update, migrate, or uninstall
title: "Install"
---

# Install

If you followed [Getting Started](/start/getting-started), you're already installed.
This section covers alternative install methods, deployment, and maintenance.

<Info>
Looking for first-time setup? Start with [Getting Started](/start/getting-started) instead.
</Info>

## System requirements

- **Node >=22**
- macOS, Linux, or Windows via WSL2
- `pnpm` only if you build from source

## Choose your install method

<CardGroup cols={2}>
  <Card title="Installer" href="/start/getting-started" icon="rocket">
    Default. The Getting Started guide walks you through it.
  </Card>
  <Card title="Global install" href="#global-install" icon="package">
    Install via curl / PowerShell with platform-specific commands.
  </Card>
  <Card title="From source" href="#from-source" icon="github">
    Contributors and local development.
  </Card>
  <Card title="Docker" href="/install/docker" icon="container">
    Containerized or headless deployments.
  </Card>
  <Card title="Nix" href="/install/nix" icon="snowflake">
    You already use Nix.
  </Card>
  <Card title="Ansible" href="/install/ansible" icon="server">
    Automated fleet provisioning.
  </Card>
  <Card title="Bun" href="/install/bun" icon="zap">
    CLI-only usage via the Bun runtime.
  </Card>
</CardGroup>

## Global install

<Tabs>
  <Tab title="macOS">
    ```bash
    curl -fsSL https://openclaw.ai/install.sh | bash
    ```
  </Tab>
  <Tab title="Linux / WSL2">
    ```bash
    curl -fsSL https://openclaw.ai/install.sh | bash
    ```
  </Tab>
  <Tab title="Windows (PowerShell)">
    ```powershell
    iwr -useb https://openclaw.ai/install.ps1 | iex
    ```
  </Tab>
</Tabs>

The installer sets up the CLI globally and runs onboarding. To skip onboarding:

<Tabs>
  <Tab title="macOS / Linux / WSL2">
    ```bash
    curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
    ```
  </Tab>
  <Tab title="Windows (PowerShell)">
    ```powershell
    & ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
    ```
  </Tab>
</Tabs>

<Accordion title="Prefer a manual npm / pnpm install?">
  If you already have Node 22+ and want to skip the installer script:

  <Tabs>
    <Tab title="npm">
      ```bash
      npm install -g openclaw@latest
      ```

      If you have libvips installed globally (common on macOS via Homebrew) and `sharp` fails to install, force prebuilt binaries:

      ```bash
      SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install -g openclaw@latest
      ```

      If you see `sharp: Please add node-gyp to your dependencies`, either install build tooling (macOS: Xcode CLT + `npm install -g node-gyp`) or use the `SHARP_IGNORE_GLOBAL_LIBVIPS=1` workaround above to skip the native build.
    </Tab>
    <Tab title="pnpm">
      ```bash
      pnpm add -g openclaw@latest
      pnpm approve-builds -g                # approve openclaw, node-llama-cpp, sharp, etc.
      ```

      pnpm requires explicit approval for packages with build scripts. After the first install shows the "Ignored build scripts" warning, run `pnpm approve-builds -g` and select the listed packages.
    </Tab>

  </Tabs>

Then run onboarding:

```bash
openclaw onboard --install-daemon
```

</Accordion>

## From source

<Steps>
  <Step title="Clone and build">
    Clone the [OpenClaw repo](https://github.com/openclaw/openclaw) and build:

    ```bash
    git clone https://github.com/openclaw/openclaw.git
    cd openclaw
    pnpm install
    pnpm ui:build # auto-installs UI deps on first run
    pnpm build
    pnpm link --global  # makes `openclaw` available on PATH
    ```

  </Step>
  <Step title="Run onboarding">
    ```bash
    openclaw onboard --install-daemon
    ```

    Tip: if you don't have a global install yet, run repo commands via `pnpm openclaw ...`.

  </Step>
</Steps>

For deeper development workflows, see [Setup](/start/setup).

## Installer details

The installer supports two methods:

- `npm` (default): `npm install -g openclaw@latest`
- `git`: clone/build from GitHub and run from a source checkout

<Accordion title="CLI flags">
  ```bash
  # Explicit npm
  curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method npm

# Install from GitHub (source checkout)

curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method git

````

| Flag | Description |
|------|-------------|
| `--install-method npm\|git` | Choose install method |
| `--git-dir <path>` | Source checkout location (default: `~/openclaw`) |
| `--no-git-update` | Skip `git pull` when using an existing checkout |
| `--no-prompt` | Disable prompts (required in CI/automation) |
| `--dry-run` | Print what would happen; make no changes |
| `--no-onboard` | Skip onboarding |
</Accordion>

<Accordion title="Environment variables">
Equivalent env vars (useful for automation):

| Variable | Description |
|----------|-------------|
| `OPENCLAW_INSTALL_METHOD=git\|npm` | Install method |
| `OPENCLAW_GIT_DIR=...` | Source checkout location |
| `OPENCLAW_GIT_UPDATE=0\|1` | Toggle git pull |
| `OPENCLAW_NO_PROMPT=1` | Disable prompts |
| `OPENCLAW_DRY_RUN=1` | Dry run mode |
| `OPENCLAW_NO_ONBOARD=1` | Skip onboarding |
| `SHARP_IGNORE_GLOBAL_LIBVIPS=0\|1` | Avoids `sharp` building against system libvips (default: `1`) |
</Accordion>

Full reference: [Installer internals](/install/installer).

## After install

<Steps>
<Step title="Run onboarding">
  ```bash
  openclaw onboard --install-daemon
  ```
</Step>
<Step title="Quick check">
  ```bash
  openclaw doctor
  ```
</Step>
<Step title="Verify the gateway">
  ```bash
  openclaw status
  openclaw health
  ```
</Step>
<Step title="Open the dashboard">
  ```bash
  openclaw dashboard
  ```
</Step>
</Steps>

## Troubleshooting: `openclaw` not found

<Accordion title="PATH diagnosis and fix">
Quick diagnosis:

```bash
node -v
npm -v
npm prefix -g
echo "$PATH"
````

If `$(npm prefix -g)/bin` (macOS/Linux) or `$(npm prefix -g)` (Windows) is **not** present inside `echo "$PATH"`, your shell can't find global npm binaries (including `openclaw`).

Fix: add it to your shell startup file (zsh: `~/.zshrc`, bash: `~/.bashrc`):

```bash
# macOS / Linux
export PATH="$(npm prefix -g)/bin:$PATH"
```

On Windows, add the output of `npm prefix -g` to your PATH.

Then open a new terminal (or `rehash` in zsh / `hash -r` in bash).
</Accordion>

## Update / uninstall

<CardGroup cols={3}>
  <Card title="Updating" href="/install/updating" icon="refresh-cw">
    Keep OpenClaw up to date.
  </Card>
  <Card title="Migrating" href="/install/migrating" icon="arrow-right">
    Move to a new machine.
  </Card>
  <Card title="Uninstall" href="/install/uninstall" icon="trash-2">
    Remove OpenClaw completely.
  </Card>
</CardGroup>
