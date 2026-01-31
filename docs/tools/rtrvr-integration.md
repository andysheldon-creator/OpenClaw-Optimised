---
title: rtrvr.ai Browser Integration
description: Use rtrvr.ai as a browser automation provider for OpenClaw
---

# rtrvr.ai Browser Integration

OpenClaw supports [rtrvr.ai](https://www.rtrvr.ai/) as a browser automation provider. rtrvr.ai offers both extension-based browser control and cloud-based browser automation with AI-powered capabilities.

## Overview

rtrvr.ai provides two modes of operation:

1. **rtrvr.ai Extension Mode** (`driver: "rtrvr"`) - Uses the rtrvr.ai Chrome extension to control your logged-in browser. Perfect for automating tasks that require your existing sessions, cookies, and credentials.

2. **rtrvr.ai Cloud Mode** (`driver: "rtrvr-cloud"`) - Uses rtrvr.ai's cloud browser infrastructure. No extension required. Ideal for scalable scraping and automation without local browser dependencies.

> **Note:** rtrvr.ai provides enriched accessibility trees, NOT screenshots. Use `snapshot` for page structure or AI actions (`planner`/`act`) for visual tasks.

## Quick Comparison

| Feature | `rtrvr` (Extension) | `rtrvr-cloud` (Cloud) |
|---------|---------------------|----------------------|
| Local browser control | ✅ Your logged-in Chrome | ❌ |
| No extension needed | ❌ | ✅ |
| Access logged-in sessions | ✅ | ❌ |
| AI-powered actions | ✅ | ✅ |
| Structured extraction | ✅ | ✅ |
| Multi-page crawl | ✅ | ✅ |
| Free tools available | ✅ | ❌ |
| Screenshot support | ❌ | ❌ |
| Accessibility tree | ✅ (get_page_data) | ✅ (/scrape) |
| Best for | Personal automation | Scale & scraping |

## Setup

### 1. Get an rtrvr.ai API Key

1. Sign up at [rtrvr.ai](https://www.rtrvr.ai/)
2. Navigate to [Cloud → API Keys](https://www.rtrvr.ai/cloud?view=api-keys)
3. Create a new API key
4. Copy the key (format: `rtrvr_xxx...`)

> Tip (extension users): after signing in to the rtrvr.ai Chrome extension, the **MCP URL** appears in the extension UI (bottom-left). It looks like:
>
> `https://mcp.rtrvr.ai?apiKey=rtrvr_example_key&deviceId=exampleDeviceId`
>
> Copy the API key and deviceId from that URL and set them in OpenClaw (`rtrvrApiKey`, `rtrvrDeviceId`).
> Do **not** paste the full MCP URL into `rtrvrApiUrl`—that field is only for base URL overrides.

### 2. Configure OpenClaw

Add rtrvr.ai profiles to your OpenClaw configuration:

```json
{
  "browser": {
    "profiles": {
      "rtrvr": {
        "driver": "rtrvr",
        "rtrvrApiKey": "rtrvr_your_api_key_here",
        "rtrvrDeviceId": "optional_device_id",
        "color": "#6366F1"
      },
      "rtrvr-cloud": {
        "driver": "rtrvr-cloud",
        "rtrvrApiKey": "rtrvr_your_api_key_here",
        "color": "#8B5CF6"
      }
    }
  }
}
```

### 3. Install rtrvr.ai Extension (for Extension Mode)

If using `driver: "rtrvr"`:

1. Install the [rtrvr.ai Chrome Extension](https://chromewebstore.google.com/detail/rtrvrai/jldogdgepmcedfdhgnmclgemehfhpomg)
2. Sign in with your rtrvr.ai account
3. The extension will appear as an available device

## Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `driver` | Yes | `"rtrvr"` for extension mode, `"rtrvr-cloud"` for cloud mode |
| `rtrvrApiKey` | Yes | Your rtrvr.ai API key |
| `rtrvrDeviceId` | No | Specific device ID (for extension mode with multiple devices) |
| `rtrvrApiUrl` | No | API base override (defaults to `https://mcp.rtrvr.ai` or `https://api.rtrvr.ai`) |
| `color` | Yes | Profile accent color (hex) |

## Usage

### Using rtrvr.ai Profile

Specify the rtrvr.ai profile when using browser actions:

```bash
# Check status
openclaw browser status --browser-profile rtrvr

# List tabs (extension mode only)
openclaw browser tabs --browser-profile rtrvr

# Open a URL
openclaw browser open https://example.com --browser-profile rtrvr

# Open + snapshot in one step (tree output)
openclaw browser open https://example.com --browser-profile rtrvr --snapshot

# Scrape a URL (open + snapshot)
openclaw browser scrape https://example.com --browser-profile rtrvr-cloud

# Take a snapshot (accessibility tree)
openclaw browser snapshot --browser-profile rtrvr
```

### Via Browser Tool

In agent mode, specify the profile parameter:

```json
{
  "action": "act",
  "profile": "rtrvr",
  "request": {
    "kind": "ai",
    "userInput": "Find the pricing page and list the starter plan details",
    "urls": ["https://example.com"]
  }
}
```

### Via Gateway (direct control API)

Use the Gateway `browser.request` method to call the control server routes directly. Example: open + snapshot in one call using `/scrape`:

```bash
openclaw gateway call browser.request --timeout 300000 --params '{
  "method":"POST",
  "path":"/scrape",
  "query":{"profile":"rtrvr-cloud"},
  "body":{"url":"https://example.com","format":"ai"}
}' --json
```

## Available Actions

### Extension Mode (`rtrvr`)

All actions are routed through the rtrvr.ai Chrome extension on your local machine.

**OpenClaw mapping:**
- `open` / `navigate` → `open_new_tab` / `goto_url`
- `snapshot` → `get_page_data` (accessibility tree)
- `scrape` → open + `snapshot` (convenience wrapper)
- `act` with `kind: "ai"` → `planner` by default (override with `tool`)
- `act` with granular kinds (`click`, `type`, `hover`, `scrollIntoView`, `press`, `drag`, `select`, `fill`, `wait`, `close`) → `take_page_action`
- `act` with `evaluate` → `execute_javascript`

**Free Tools (no credits):**

| Tool | Description |
|------|-------------|
| `get_browser_tabs` | List open browser tabs |
| `get_page_data` | Get enriched accessibility tree |
| `take_page_action` | Execute system tools (click, type, scroll, etc.) |
| `execute_javascript` | Run JS in browser sandbox |

**Credit Tools:**

| Tool | Description |
|------|-------------|
| `planner` | Multi-step AI orchestration from natural language |
| `act` | AI-powered intelligent page interaction |
| `extract` | Structured data extraction with schema |
| `crawl` | Multi-page crawl with extraction |

> Timeout note: OpenClaw defaults rtrvr AI tasks (`planner`/`act`/`extract`/`crawl`) to **12 minutes**. You can override by passing `timeoutMs` in the browser tool call or by setting a higher `--timeout` when calling `browser.request` via the Gateway.

### Cloud Mode (`rtrvr-cloud`)

All actions are executed on rtrvr.ai's cloud browser infrastructure via the Agent API.

**OpenClaw mapping:**
- `open` / `snapshot` → `/scrape` (accessibility tree)
- `scrape` → `/scrape` (open + snapshot, returns tab + snapshot)
- `act` with `kind: "ai"` → `/agent` (planner/act/extract/crawl)
- Granular `act` kinds (`click`, `type`, etc.) are not supported in cloud mode

## Quick capability reference

| Capability | `rtrvr` (Extension) | `rtrvr-cloud` (Cloud) | How to invoke |
|---|---|---|---|
| Open tab | ✅ | ✅ | `openclaw browser open <url>` |
| Snapshot (tree) | ✅ (`get_page_data`) | ✅ (`/scrape`) | `openclaw browser snapshot` |
| Scrape (open + snapshot) | ✅ (wrapper) | ✅ (`/scrape`) | `openclaw browser scrape <url>` |
| AI planner/act | ✅ | ✅ | `openclaw browser act` (`kind:"ai"`) |
| Extract / crawl | ✅ | ✅ | `tool:"extract"` / `tool:"crawl"` |
| Granular actions | ✅ | ❌ | `click/type/press/drag/select/...` |
| Screenshots | ❌ | ❌ | Use snapshot |

## End-to-end examples

### Extension mode (planner default when URLs provided)

```bash
openclaw gateway call browser.request --timeout 300000 --params '{
  "method":"POST",
  "path":"/act",
  "query":{"profile":"rtrvr"},
  "body":{
    "kind":"ai",
    "userInput":"Open the URL and summarize the heading.",
    "urls":["https://example.com"]
  }
}' --json
```

### Extension mode (granular action)

```bash
openclaw browser snapshot --browser-profile rtrvr --format ai
# use a ref from the snapshot:
openclaw browser click 12 --browser-profile rtrvr
```

### Cloud mode (agent)

```bash
openclaw gateway call browser.request --timeout 300000 --params '{
  "method":"POST",
  "path":"/act",
  "query":{"profile":"rtrvr-cloud"},
  "body":{
    "kind":"ai",
    "userInput":"Extract the page title.",
    "urls":["https://example.com"]
  }
}' --json
```

## System Tools

The following granular system tools are available for `take_page_action` in extension mode. OpenClaw uses them when you call `act` with granular kinds like `click`, `type`, `hover`, `scrollIntoView`, `press`, `drag`, `select`, `fill`, `wait`, and `close`. Cloud mode relies on `/agent` instead of direct tool calls.

### Core Interaction & Form Actions
- `click_element` - Click on an element
- `type_into_element` - Type text into an input
- `type_and_enter` - Type text and press Enter
- `select_dropdown_value` - Select dropdown option
- `clear_element` - Clear input field
- `focus_element` - Focus on element
- `check_field_validity` - Validate form field
- `select_text` - Select text in element

### Advanced Mouse & Keyboard
- `hover_element` - Hover over element
- `right_click_element` - Right-click element
- `double_click_element` - Double-click element
- `press_key` - Press keyboard key
- `mouse_wheel` - Scroll with mouse wheel

### Drag, Drop & Widgets
- `drag_element` - Start dragging element
- `drag_and_drop` - Drag and drop between elements
- `adjust_slider` - Adjust slider value

### Scroll & Viewport
- `scroll_page` - Scroll page (up/down/left/right)
- `scroll_to_element` - Scroll element into view

### Touch Gestures
- `swipe_element` - Swipe gesture
- `long_press_element` - Long press
- `pinch_zoom` - Pinch to zoom

### Navigation & Tab Management
- `go_back` - Navigate back
- `go_forward` - Navigate forward
- `goto_url` - Navigate to URL
- `refresh_page` - Refresh page
- `open_new_tab` - Open new tab
- `switch_tab` - Switch to tab
- `close_tab` - Close tab

### Information & External
- `describe_images` - Get image descriptions
- `google_search` - Perform Google search

### Clipboard
- `copy_text` - Copy text
- `paste_text` - Paste text

### Wait & Control Flow
- `wait_action` - Wait for duration
- `wait_for_element` - Wait for element to appear
- `answer_task` - Provide answer/result

### File Operations
- `upload_file` - Upload file to input

## Advanced Features

### AI-Powered Actions

rtrvr.ai supports natural language instructions for complex browser automation. OpenClaw defaults to `planner` when `userInput` and `urls` are provided. Override with `tool` (`planner`, `act`, `extract`, `crawl`).

```json
{
  "action": "act",
  "profile": "rtrvr",
  "request": {
    "kind": "ai",
    "userInput": "Fill out the contact form with test data and submit",
    "urls": ["https://example.com/contact"]
  }
}
```

### Structured Data Extraction

Extract data with a defined schema:

```json
{
  "action": "act",
  "profile": "rtrvr",
  "request": {
    "kind": "ai",
    "tool": "extract",
    "userInput": "Extract all product names and prices",
    "urls": ["https://example.com/products"],
    "schema": {
      "fields": [
        { "name": "productName", "type": "string" },
        { "name": "price", "type": "number" }
      ]
    }
  }
}
```

### Multi-Device Support (Extension Mode)

If you have multiple Chrome profiles with the rtrvr.ai extension installed, target a specific device:

```json
{
  "browser": {
    "profiles": {
      "rtrvr-work": {
        "driver": "rtrvr",
        "rtrvrApiKey": "rtrvr_xxx",
        "rtrvrDeviceId": "your_work_device_id",
        "color": "#6366F1"
      }
    }
  }
}
```

Find your device ID by calling `list_devices` or checking the MCP URL in the extension.

## Credits and Usage

**Extension Mode Free Tools (no credits):**
- `get_browser_tabs`
- `get_page_data`
- `take_page_action`
- `execute_javascript`

**Credit-Based Tools:**
- `planner` / `act` (AI-powered)
- `extract`
- `crawl`
- All cloud mode operations

Check your credit balance:

```bash
openclaw browser status --browser-profile rtrvr
```

## Screenshot Limitations

**rtrvr.ai does NOT provide screenshot capability.** Instead, it provides enriched accessibility trees that represent the page structure.

- **Extension mode:** Use `get_page_data` for accessibility tree
- **Cloud mode:** Use `/scrape` API for accessibility tree

For visual tasks, use AI-powered tools (`planner`, `act`) which understand page context through the accessibility tree.
OpenClaw will return an error if you call `screenshot` on an rtrvr profile.

## Troubleshooting

### Extension Not Connected

If you see "No rtrvr.ai extension device is online":

1. Ensure the rtrvr.ai Chrome extension is installed
2. Open Chrome and click the rtrvr.ai extension icon
3. Sign in with your rtrvr.ai account
4. Refresh the extension connection (close/reopen popup)

### API Key Invalid

If you see authentication errors:

1. Verify your API key is correct
2. Regenerate the key from [rtrvr.ai/cloud](https://www.rtrvr.ai/cloud?view=api-keys)

### Device Not Found

If targeting a specific device:

1. Use `list_devices` to see available devices
2. Verify the device ID matches an online device
3. Omit `rtrvrDeviceId` to auto-select the most recent device

## Comparison with Native Browser Control

| Feature | Native OpenClaw | rtrvr Extension | rtrvr Cloud |
|---------|-----------------|-----------------|-------------|
| Local browser control | ✅ | ✅ | ❌ |
| Screenshot | ✅ | ❌ | ❌ |
| Accessibility tree | ✅ | ✅ | ✅ |
| AI-powered actions | ❌ | ✅ | ✅ |
| Structured extraction | Limited | ✅ | ✅ |
| No extension needed | Via managed profile | ❌ | ✅ |
| Uses existing logins | ✅ (managed profile) | ✅ | ❌ |
| Credits required | ❌ | Some features | ✅ |

## API Endpoints

| Driver | Endpoint | Purpose |
|--------|----------|---------|
| `rtrvr` | `https://mcp.rtrvr.ai` | MCP API for extension control (override via `rtrvrApiUrl`) |
| `rtrvr-cloud` | `https://api.rtrvr.ai/agent` | Agent API for AI tasks (override via `rtrvrApiUrl`) |
| `rtrvr-cloud` | `https://api.rtrvr.ai/scrape` | Scrape API for page data (override via `rtrvrApiUrl`) |

## See Also

- [Browser Tool](/tools/browser) - Native browser automation
- [Chrome Extension](/tools/chrome-extension) - OpenClaw's Chrome extension
- [rtrvr.ai Documentation](https://www.rtrvr.ai/docs) - Full rtrvr.ai docs
- [rtrvr.ai MCP Docs](https://www.rtrvr.ai/docs/mcp) - Browser as API/MCP
- [rtrvr.ai Agent Docs](https://www.rtrvr.ai/docs/agent) - Cloud Agent API
