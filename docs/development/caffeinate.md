---
title: "Caffeinate (Preventing macOS Sleep)"
summary: "How to use caffeinate to keep macOS awake during long-running gateway operations"
---

# Caffeinate (Preventing macOS Sleep)

macOS will normally sleep after a period of inactivity, which interrupts the OpenClaw gateway and any running agent sessions. The `caffeinate` utility prevents this.

## Quick Start

```bash
# Run the gateway with sleep prevention enabled
./scripts/caffeinate-gateway.sh

# Or wrap any command manually
caffeinate -ism pnpm openclaw gateway
```

## What is caffeinate?

`caffeinate` is a built-in macOS utility (`/usr/bin/caffeinate`) that creates power management assertions to prevent the system from sleeping. When you run a command through caffeinate, it keeps the Mac awake until that command completes.

## When to Use It

- **Running the gateway 24/7** on a Mac mini or always-on machine
- **Long-running agent tasks** that could take hours
- **Development sessions** where you don't want interruptions
- **Headless operation** (Mac with lid closed on AC power)
- **VM hosts** running macOS VMs that need to stay awake

## The caffeinate-gateway.sh Script

We provide a convenience wrapper at `scripts/caffeinate-gateway.sh`:

```bash
# Basic usage
./scripts/caffeinate-gateway.sh

# With custom port
./scripts/caffeinate-gateway.sh --port 18790

# With verbose logging
./scripts/caffeinate-gateway.sh --verbose
```

This script uses these caffeinate flags:

| Flag | Purpose                                                           |
| ---- | ----------------------------------------------------------------- |
| `-i` | Prevent **idle sleep** (system won't sleep due to inactivity)     |
| `-s` | Prevent **system sleep on AC** (won't sleep even with lid closed) |
| `-m` | Prevent **disk idle sleep** (keeps disk spinning)                 |

We intentionally don't use `-d` (prevent display sleep) because the gateway doesn't need the display.

## Manual Usage

You can use caffeinate directly with any command:

```bash
# Prevent idle sleep while running the gateway
caffeinate -i pnpm openclaw gateway

# Prevent all sleep types (most aggressive)
caffeinate -dims pnpm openclaw gateway

# Prevent sleep for a specific duration (1 hour = 3600 seconds)
caffeinate -i -t 3600

# Prevent sleep while another process runs (by PID)
caffeinate -i -w $(pgrep -f "openclaw gateway")
```

## Caffeinate Options Reference

| Option     | Description                                          |
| ---------- | ---------------------------------------------------- |
| `-d`       | Prevent the **display** from sleeping                |
| `-i`       | Prevent the **system** from idle sleeping            |
| `-m`       | Prevent the **disk** from idle sleeping              |
| `-s`       | Prevent the **system** from sleeping (AC power only) |
| `-u`       | Declare **user activity** (turns display on if off)  |
| `-t <sec>` | Timeout: release assertions after N seconds          |
| `-w <pid>` | Wait for the specified process to exit               |

## Integration with launchd

If you're running the gateway via launchd (the default for production), you have two options:

### Option 1: Modify the plist (Recommended for 24/7)

The launchd plist can include caffeinate in the program arguments:

```xml
<key>ProgramArguments</key>
<array>
  <string>/usr/bin/caffeinate</string>
  <string>-ism</string>
  <string>/opt/homebrew/bin/node</string>
  <string>/path/to/openclaw.mjs</string>
  <string>gateway</string>
</array>
```

### Option 2: System Settings

For a more permanent solution without code changes:

1. Open **System Settings** → **Battery** (or **Energy Saver** on older macOS)
2. Disable "Put hard disks to sleep when possible"
3. Set "Turn display off after" to Never (if needed)
4. Enable "Prevent automatic sleeping when the display is off" (if available)

## Checking Power Assertions

To see what's currently preventing sleep:

```bash
# Show all power assertions
pmset -g assertions

# Check if caffeinate is running
pgrep -fl caffeinate
```

Example output when caffeinate is active:

```
Assertion status system-wide:
   PreventUserIdleSystemSleep  1
   PreventDiskIdle             1
```

## Troubleshooting

### Mac still sleeps

1. Check if caffeinate is actually running: `pgrep -fl caffeinate`
2. Verify power assertions: `pmset -g assertions`
3. Make sure you're on AC power if using `-s` flag
4. Check for conflicting scheduled sleep in System Settings

### Gateway exits when lid closes

The `-s` flag only works on AC power. If you're on battery, the Mac may still sleep. Either:

- Keep the Mac plugged in
- Use an app like Amphetamine for more control
- Configure `pmset` for clamshell mode:
  ```bash
  sudo pmset -a disablesleep 1  # Caution: affects all sleep
  ```

### Display keeps turning on

If using `-u` (user activity), the display will turn on. Use `-i` instead for idle sleep prevention without affecting the display.

## Related Documentation

- [macOS Platform Guide](/platforms/macos)
- [macOS VM Setup](/platforms/macos-vm) - Running 24/7 section
- [Gateway Runbook](/gateway)
- `man caffeinate` - Full system documentation
- `man pmset` - Power management settings
