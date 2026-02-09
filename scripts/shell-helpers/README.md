# OpenClaw Shell Helpers <!-- omit in toc -->

User-friendly shell commands for managing OpenClaw Docker containers. These helpers make it easy to start, stop, configure, and interact with OpenClaw without memorizing complex docker-compose commands.

- [Features](#features)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [First Time Setup](#first-time-setup)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Restart After Configuration Changes](#restart-after-configuration-changes)
  - [Access the Dashboard](#access-the-dashboard)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
- [Troubleshooting](#troubleshooting)
  - [Commands Not Found](#commands-not-found)
  - [Token Mismatch Errors](#token-mismatch-errors)
  - [Permission Denied](#permission-denied)
  - [Container Not Starting](#container-not-starting)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Features

✨ **Simple Commands** - Intuitive names like `openclaw-start`, `openclaw-stop`, `openclaw-dashboard`
🎨 **Beautiful Output** - Colorful, emoji-rich terminal output with clear guidance
🔧 **Auto-Configuration** - Helpers guide you through setup and troubleshooting
🚀 **Fast Onboarding** - Get started with OpenClaw in minutes
📖 **Self-Documenting** - Run `openclaw-help` anytime to see available commands

## Quick Start

### Installation

**Add to your shell config (`~/.zshrc` or `~/.bashrc`):**

```bash
source /path/to/openclaw/scripts/shell-helpers/openclaw-helpers.sh
```

**Reload your shell:**

```bash
source ~/.zshrc
```

### First Time Setup

**Start the gateway:**

```bash
openclaw-start
```

**Configure authentication token:**

```bash
openclaw-fix-token
```

**Open the web dashboard:**

```bash
openclaw-dashboard
```

**If you see "pairing required", approve devices:**

```bash
openclaw-devices
```

```bash
openclaw-approve <request-id>
```

**Set up WhatsApp (optional):**

```bash
openclaw-shell
```

Then inside the container:

```bash
openclaw channels login --channel whatsapp
```

## Available Commands

### Basic Operations

- `openclaw-start` - Start the OpenClaw gateway
- `openclaw-stop` - Stop the gateway
- `openclaw-restart` - Restart the gateway
- `openclaw-status` - Check container status
- `openclaw-logs` - View live logs (follows output)

### Container Access

- `openclaw-shell` - Interactive shell inside the gateway container
- `openclaw-cli <command>` - Run OpenClaw CLI commands
- `openclaw-exec <command>` - Execute arbitrary commands in the container

### Web UI & Devices

- `openclaw-dashboard` - Open web UI in browser with authentication
- `openclaw-devices` - List device pairing requests
- `openclaw-approve <id>` - Approve a device pairing request

### Setup & Configuration

- `openclaw-fix-token` - Configure gateway authentication token (run once after setup)

### Maintenance

- `openclaw-rebuild` - Rebuild the Docker image
- `openclaw-clean` - ⚠️ Remove all containers and volumes (destructive!)

### Utilities

- `openclaw-health` - Run gateway health check
- `openclaw-token` - Display the gateway authentication token
- `openclaw-cd` - Jump to the OpenClaw project directory
- `openclaw-config` - Open the OpenClaw config directory
- `openclaw-workspace` - Open the workspace directory
- `openclaw-help` - Show all available commands with examples

## Common Workflows

### Check Status and Logs

**Check container status:**

```bash
openclaw-status
```

**View live logs:**

```bash
openclaw-logs
```

### Restart After Configuration Changes

**Restart the gateway:**

```bash
openclaw-restart
```

**Watch the logs:**

```bash
openclaw-logs
```

### Access the Dashboard

```bash
openclaw-dashboard
```

The dashboard will open automatically with the correct authentication token.

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
openclaw-shell
```

**Inside the container, login to WhatsApp:**

```bash
openclaw channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
openclaw status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
openclaw-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
openclaw-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
openclaw-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the OpenClaw config
3. Restart the gateway
4. Verify the configuration

## Troubleshooting

### Commands Not Found

**Source the helpers file:**

```bash
source /path/to/openclaw/scripts/shell-helpers/openclaw-helpers.sh
```

Add this line to your `~/.zshrc` or `~/.bashrc` for persistence.

### Token Mismatch Errors

Run `openclaw-fix-token` to automatically configure the authentication token.

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

### Container Not Starting

**Check the logs:**

```bash
openclaw-logs
```

Common issues:

- Port 18789 or 18790 already in use
- Missing environment variables in `.env`
- Docker daemon not running

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- OpenClaw project (from `docker-setup.sh`)

## Contributing

Found a bug or want to add a new helper? Contributions are welcome!

1. Test your changes locally
2. Ensure helpers work in both bash and zsh
3. Follow the existing naming convention (`openclaw-*`)
4. Add documentation for new commands
5. Submit a pull request

## License

Same as the OpenClaw project.

## Support

- 📚 [OpenClaw Documentation](https://docs.openclaw.ai)
- 💬 [Community Discussions](https://github.com/openclaw/openclaw/discussions)
- 🐛 [Report Issues](https://github.com/openclaw/openclaw/issues)
