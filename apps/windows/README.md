# Clawdbot Windows Companion

Windows companion application for the Clawdbot Gateway, providing system tray integration and Control UI access.

## Project Structure

```
apps/windows/
├── ClawdbotWindows.sln              # Solution file
├── src/
│   ├── Clawdbot.Windows/            # Main WPF application
│   │   ├── App.xaml(.cs)            # Application entry point
│   │   ├── MainWindow.xaml(.cs)     # WebView2 Control UI window
│   │   ├── ExecApprovalDialog.xaml(.cs)  # Command approval dialog
│   │   ├── SettingsWindow.xaml(.cs)      # Settings UI dialog
│   │   └── SystemTrayIcon.cs        # System tray implementation
│   ├── Clawdbot.Windows.Core/       # Gateway client and services
│   │   ├── GatewayChannel.cs        # WebSocket client
│   │   ├── AppLogger.cs             # File-based logging
│   │   ├── AppSettings.cs           # Settings persistence (JSON)
│   │   ├── AutoStartHelper.cs       # Windows auto-start (Registry)
│   │   ├── NotificationSounds.cs    # System notification sounds
│   │   ├── WebView2Helper.cs        # WebView2 runtime detection
│   │   ├── ExecApprovalModels.cs    # Exec approval request/response types
│   │   └── ExecApprovalService.cs   # Exec approval event handling
│   └── Clawdbot.Windows.Protocol/   # Auto-generated protocol models
│       └── GatewayModels.cs         # Protocol v3 types
└── tests/
    └── Clawdbot.Windows.Tests/      # Unit and integration tests
        ├── Phase0ValidationTests.cs # Gateway connection tests
        ├── ExecApprovalTests.cs     # Exec approval model tests
        └── SettingsTests.cs         # Settings persistence tests
```

## Prerequisites

- .NET 9.0 SDK
- Windows 10 version 1903 or later (for WebView2)
- Microsoft Edge WebView2 Runtime (auto-detected, downloads prompted if missing)
- Clawdbot Gateway running (in WSL2 or natively)

## Building

```powershell
cd apps/windows
dotnet build
```

## Running

```powershell
# From the apps/windows directory
dotnet run --project src\Clawdbot.Windows
```

Or run the built executable directly:
```powershell
.\src\Clawdbot.Windows\bin\Debug\net9.0-windows\Clawdbot.exe
```

The application will:
1. Start minimized to the system tray
2. Attempt to connect to the Gateway at `ws://127.0.0.1:18789/`
3. Display connection status via the tray icon color
4. Show the Control UI in a WebView2 window when double-clicking the tray icon

## Logging

Logs are written to:
```
%LOCALAPPDATA%\Clawdbot\logs\clawdbot-YYYY-MM-DD.log
```

View logs in PowerShell:
```powershell
Get-Content "$env:LOCALAPPDATA\Clawdbot\logs\clawdbot-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait
```

## Settings

Settings are stored in:
```
%LOCALAPPDATA%\Clawdbot\settings.json
```

Access settings via the system tray icon → **Settings**.

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Gateway URL | `ws://127.0.0.1:18789/` | WebSocket URL of the Gateway |
| Start on login | Off | Launch automatically at Windows startup |
| Minimize to tray | On | Minimize to tray instead of closing |
| Play sounds | On | Play notification sounds for events |
| Show connection notifications | On | Show balloon notifications |

### Auto-Start

When enabled, adds a registry entry to:
```
HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
```

This starts Clawdbot automatically when you log in to Windows.

## Exec Approval Dialogs

When an AI agent requests to run a command, Clawdbot shows an approval dialog:

![Exec Approval Dialog](../../docs/images/windows-exec-approval.png)

### Features
- **Command display**: Shows the full command in a monospaced font
- **Context details**: Working directory, executable path, host, agent ID, security level
- **Countdown timer**: Auto-denies after timeout (typically 60 seconds)
- **Three actions**:
  - **Allow Once** (green): Run this command once
  - **Always Allow** (blue): Add to allowlist and run
  - **Don't Allow** (red): Deny the command

### Testing
In Debug builds, right-click the system tray icon and select **Debug > Test Approval Dialog** to see a sample dialog.

### Keyboard Shortcuts
- **Enter**: Allow Once (default button)
- **Escape**: Don't Allow

## Testing

### Unit Tests
```powershell
dotnet test
```

Current test results: **23 passing, 7 skipped** (integration tests require Gateway)

### Integration Tests (requires running Gateway)
Start the Gateway first:
```bash
# In WSL2 or Linux terminal
clawdbot gateway run --bind loopback --port 18789
```

Then the integration tests will run automatically (they detect if the Gateway is available).

## Architecture

### Clawdbot.Windows.Protocol
Auto-generated C# models matching the Gateway's TypeScript schema (Protocol version 3).
- Request/response frames
- Event payloads
- Configuration types

### Clawdbot.Windows.Core
Gateway client with:
- WebSocket connection management
- Automatic reconnection with exponential backoff
- Request/response correlation
- Event subscription and dispatch
- File-based logging (AppLogger)
- WebView2 runtime detection (WebView2Helper)

### Clawdbot.Windows (WPF App)
- System tray icon with context menu
- WebView2 embedding the Control UI (`http://127.0.0.1:18789/ui`)
- Connection status visualization
- Graceful exit handling

## Development Status

**Phase 0: Foundation Validation** ✅
- [x] Project structure
- [x] Protocol models (GatewayModels.cs)
- [x] Gateway WebSocket client (GatewayChannel.cs)
- [x] Unit tests passing (23/23)
- [x] Application icon from favicon.ico
- [x] File-based debug logging
- [x] WebView2 runtime detection

**Phase 1: Core Features** ✅
- [x] System tray icon with context menu
- [x] WebView2 Control UI embedding
- [x] Connection status in tray tooltip
- [x] Exec approval dialogs (ExecApprovalDialog.xaml)
- [x] Exec approval service with queue management
- [x] Timeout handling (auto-deny on expiry)
- [x] Debug menu for testing dialogs

**Phase 2: Production Ready** ✅
- [x] Settings persistence (`%LOCALAPPDATA%\Clawdbot\settings.json`)
- [x] Auto-start on login (Windows Registry)
- [x] Settings UI window
- [x] Notification sounds (Windows system sounds)
- [x] Settings tests (6 new tests)

**Phase 3: Distribution** � (In Progress)
- [x] Build scripts (`scripts/build.ps1`)
- [x] Inno Setup installer template (`installer/clawdbot.iss`)
- [x] Community documentation (`docs/platforms/windows-companion-build-guide.md`)
- [ ] Code signing
- [ ] Auto-update mechanism
- [ ] Release automation

See [Windows-Companion-App-Plan.md](../../Windows-Companion-App-Plan.md) for the full roadmap.

## Known Issues

1. **No Gateway Available**: Without a running Gateway, the app shows "Disconnected" status. Need to install pnpm/bun to build and run the Gateway locally.

2. **Manual Testing Required**: Some features (tray icon visibility, window opening) require manual verification.

3. **WebView2 Control UI**: When Gateway is not connected, the WebView2 shows a "Waiting for Gateway connection..." overlay.

## Gateway Connection

The Windows companion connects to the Clawdbot Gateway via WebSocket:

| Component | URL |
|-----------|-----|
| Gateway WebSocket | `ws://127.0.0.1:18789/` |
| Control UI | `http://127.0.0.1:18789/ui` |

The Gateway must be running for the companion app to function.

## License

MIT - see [LICENSE](../../LICENSE) in the project root.
