# Implementation Plan: Named Persistent Sessions for WebChat

## Overview

Enable users to create, name, and switch between multiple WebChat sessions without losing context. Named sessions should persist across `/new` commands and appear in the sessions list.

## Current State Analysis

### ✅ Already Exists

1. **URL Parameter Support**: `?session=<key>` in URL switches session (app-settings.ts)
2. **Session Labels**: `SessionEntry.label` field exists (types.ts)
3. **Sessions List UI**: Full sessions management UI in Control dashboard
4. **Session Store**: Persistent storage in `~/.openclaw/sessions-store.json`
5. **Multi-session Infrastructure**: Gateway already supports arbitrary session keys

### ❌ Missing Functionality

1. **Session Persistence Flag**: No way to mark a session as "persistent" (don't reset)
2. **Named Session Creation**: No easy way to create a new named session from webchat
3. **Session Switcher UI**: No quick session switcher in the webchat interface
4. **Session Protection**: `/new` blindly resets any session

## Implementation Plan

### Phase 1: Backend - Session Persistence Flag

**File**: `src/config/sessions/types.ts`

- Add `persistent?: boolean` to `SessionEntry` type
- Add `userCreated?: boolean` to distinguish user-named vs auto-created sessions

**File**: `src/gateway/server-methods/sessions.ts`

- **Method: `sessions.reset`**
  - Check if `entry.persistent === true` before resetting
  - If persistent, return error: "Cannot reset persistent session. Use sessions.delete if you want to clear it."
- **Method: `sessions.create` (NEW)**
  - Create new endpoint to spawn a named session
  - Parameters: `{ name: string, label?: string, basedOn?: string }`
  - Generates session key: `agent:<agentId>:named:<uuid>` or use the name if safe
  - Creates entry with `persistent: true`, `userCreated: true`
  - Returns: `{ key, sessionId, label }`

- **Method: `sessions.patch`**
  - Allow toggling `persistent` flag
  - Validate that persistent sessions have a label

### Phase 2: Backend - Session Reset Protection

**File**: `src/auto-reply/reply/get-reply-run.ts`

- In reset handling (around line 290), check session entry for `persistent` flag
- If persistent, skip reset and reply: "This is a persistent session '{label}'. Use /delete-session to clear it, or switch to another session."

**File**: `src/gateway/server-methods/chat.ts`

- When handling `/new` or `/reset` commands, check if current session is persistent
- Block reset, suggest switching sessions instead

### Phase 3: Frontend - Session Management UI

**File**: `ui/src/ui/views/chat-header.tsx` (or relevant chat component)

- Add session dropdown/switcher in webchat header
- Show current session label (or "Main" if unlabeled)
- Dropdown shows:
  - Current session (highlighted)
  - Recent sessions (last 5)
  - "New Session..." button
  - "Manage Sessions..." link to sessions tab

**File**: `ui/src/ui/controllers/sessions.ts`

- Add `createSession(name: string, label?: string)` method
- Add `switchSession(key: string)` method that updates URL

**File**: `ui/src/ui/app-chat.ts`

- Add session creation dialog/modal
  - Input: Session name (becomes label)
  - Checkbox: "Make persistent" (default: true)
  - Button: Create & Switch

### Phase 4: Frontend - Sessions List Enhancements

**File**: `ui/src/ui/views/sessions.ts`

- Add "Persistent" column/badge to sessions table
- Add "New Session" button at top
- Add action to toggle persistent flag
- Filter: Show "Persistent Only" toggle

**File**: `ui/src/ui/controllers/sessions.ts`

- Add `togglePersistent(key: string, persistent: boolean)` method

### Phase 5: Command Handling

**File**: `src/auto-reply/commands-registry.data.ts`

- Add new command: `/session` with subcommands:
  - `/session new <name>` - Create new named session
  - `/session switch <name>` - Switch to existing session
  - `/session list` - Show available sessions (webchat shows clickable list)
  - `/session delete` - Delete current session (if persistent)
  - `/session rename <newname>` - Rename current session

**Implementation**:

- Text aliases for commands
- Handler functions in appropriate command module
- Webchat-specific responses (e.g., session list with links)

### Phase 6: URL & Navigation

**File**: `ui/src/ui/app-settings.ts`

- Already handles `?session=` param ✅
- Ensure session switching updates URL cleanly
- Add `syncUrlWithSessionKey()` calls in switcher

**File**: `ui/src/ui/navigation.ts`

- Add session key to URL state management
- Support browser back/forward for session switching

## Implementation Order (Priority)

1. **Backend persistence flag** (Phase 1) - Core functionality
2. **Backend reset protection** (Phase 2) - Prevents data loss
3. **Basic UI switcher** (Phase 3) - User-facing feature
4. **Command handling** (Phase 5) - Power user features
5. **Enhanced sessions list** (Phase 4) - Nice-to-have improvements
6. **URL polish** (Phase 6) - Final touches

## Migration & Compatibility

### Existing Sessions

- Default `persistent: false` for all existing sessions
- Main session can be made persistent via settings
- No breaking changes to existing functionality

### Config Schema

- Add optional config: `session.defaultPersistent: boolean` (default: false)
- Add: `session.protectMainSession: boolean` (default: false)

## Testing Plan

1. **Unit Tests**
   - Session creation with persistent flag
   - Reset blocked on persistent sessions
   - Session switching logic

2. **Integration Tests**
   - Create named session → switch → verify context preserved
   - Try to reset persistent session → verify blocked
   - Reset non-persistent session → verify cleared

3. **E2E Tests**
   - Full user flow: create session → have conversation → switch → return → verify context
   - Multiple browser tabs with different sessions
   - URL parameter session switching

## Security Considerations

- Validate session names (no path traversal, special chars)
- Ensure session keys are scoped per agent
- Prevent session enumeration attacks
- Rate limit session creation per IP/user

## Documentation Updates

- **User Guide**: How to create and manage named sessions
- **API Docs**: New `sessions.create` endpoint
- **Config Reference**: New session config options
- **Migration Guide**: How existing users can adopt named sessions

## Open Questions

1. **Session naming strategy**: Use human-readable names in key or just UUID?
   - Proposal: Use UUID in key, store name in label field
2. **Max sessions per user**: Enforce limits?
   - Proposal: Configurable limit (default: 50 named sessions)
3. **Auto-cleanup**: Delete old unused persistent sessions?
   - Proposal: Optional TTL for inactive persistent sessions

4. **Session templates**: Allow creating sessions with preset configs?
   - Future enhancement

## Related Issues

- GitHub Issue #4627: [webchat] Multi-session support via URL param or tabs
- GitHub Issue #6784: "New session" button is destructive
- GitHub Issue #1159: Parallel session processing

## Success Criteria

✅ Users can create named sessions from webchat
✅ Named sessions persist across `/new` commands
✅ Session switcher UI allows quick switching
✅ Sessions list shows all named sessions
✅ URL parameter `?session=work` works seamlessly
✅ No breaking changes to existing single-session workflow
