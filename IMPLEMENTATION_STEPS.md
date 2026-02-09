# Implementation Steps: Named Persistent Sessions

Follow these steps in order to implement the feature incrementally. Each step should be tested before moving to the next.

## Step 1: Update Type Definitions ✅

**Files to modify:**

- `src/config/sessions/types.ts`

**Changes:**

```typescript
export type SessionEntry = {
  // ... existing fields ...
  persistent?: boolean;
  userCreated?: boolean;
  description?: string;
  createdAt?: number;
};
```

**Test:**

```bash
npm run typecheck
```

## Step 2: Add Protocol Types ✅

**Files to modify:**

- `src/gateway/protocol/index.ts`

**Changes:**

- Add `SessionsCreateParams` type
- Add `SessionsCreateResult` type
- Add validation schema `SessionsCreateParamsSchema`

**Test:**

```bash
npm run typecheck
```

## Step 3: Add Gateway Method Declaration ✅

**Files to modify:**

- `src/gateway/server-methods-list.ts`

**Changes:**

```typescript
export const GATEWAY_SERVER_METHODS = [
  // ... existing ...
  "sessions.create",
] as const;
```

**Test:**

```bash
npm run typecheck
```

## Step 4: Implement Backend Session Creation ⚙️

**Files to modify:**

- `src/gateway/server-methods/sessions.ts`

**Changes:**

1. Import required types
2. Add `sessions.create` handler (see TECHNICAL_SPEC.md)
3. Modify `sessions.reset` to check `persistent` flag
4. Add validation and error handling

**Test:**

```bash
# Start gateway
openclaw gateway start

# Test with curl or Postman
curl -X POST http://localhost:5004/api \
  -H "Content-Type: application/json" \
  -d '{
    "method": "sessions.create",
    "params": {
      "label": "Test Session",
      "persistent": true
    }
  }'
```

## Step 5: Add Migration Logic ⚙️

**Files to create:**

- `src/config/sessions/migration.ts`

**Files to modify:**

- `src/config/sessions/store.ts`

**Changes:**

1. Create migration function
2. Call migration in `loadSessionStore`
3. Handle existing sessions gracefully

**Test:**

```bash
# Backup existing sessions
cp ~/.openclaw/sessions-store.json ~/.openclaw/sessions-store.backup.json

# Start gateway (migration should run automatically)
openclaw gateway restart

# Verify migration
cat ~/.openclaw/sessions-store.json | jq
```

## Step 6: Frontend Gateway Client Method 🎨

**Files to modify:**

- `ui/src/ui/gateway.ts`

**Changes:**

- Add `SessionCreateRequest` type
- Add `SessionCreateResponse` type
- Add `createSession()` method to `GatewayBrowserClient`

**Test:**

```bash
cd ui && npm run typecheck
```

## Step 7: Frontend Session Controller 🎨

**Files to modify:**

- `ui/src/ui/controllers/sessions.ts`

**Changes:**

- Add `createSession()` function
- Add `switchSession()` function
- Add `togglePersistent()` function

**Test:**

```bash
cd ui && npm run typecheck
```

## Step 8: Create Session Switcher Component 🎨

**Files to create:**

- `ui/src/ui/components/session-switcher.ts`

**Changes:**

1. Create LitElement component
2. Implement dropdown UI
3. Implement create dialog
4. Add styling
5. Wire up event handlers

**Test:**

```bash
cd ui && npm run dev
# Open http://localhost:5173 and check console for errors
```

## Step 9: Integrate Switcher into Chat UI 🎨

**Files to modify:**

- `ui/src/ui/app-render.ts` (or wherever chat header is)

**Changes:**

1. Import session-switcher component
2. Add switcher to chat header
3. Pass necessary props (state, currentKey)

**Test:**

```bash
cd ui && npm run dev
# Verify switcher appears in chat header
```

## Step 10: Add Command Handlers ⌨️

**Files to modify:**

- `src/auto-reply/commands-registry.data.ts`

**Changes:**

1. Add `/session new <name>` command
2. Add `/session list` command
3. Add `/session switch <name>` command
4. Add `/session rename <name>` command
5. Add `/session delete` command

**Test:**

```bash
# In chat interface, try:
/session new Work Session
/session list
/session switch Work Session
```

## Step 11: Update Sessions List UI 🎨

**Files to modify:**

- `ui/src/ui/views/sessions.ts`

**Changes:**

1. Add "Persistent" column with badge
2. Add "New Session" button at top
3. Add filter for persistent sessions
4. Add toggle action for persistent flag

**Test:**

```bash
cd ui && npm run dev
# Navigate to Sessions tab
# Verify all UI elements are present and functional
```

## Step 12: URL & Navigation Polish 🎨

**Files to modify:**

- `ui/src/ui/app-settings.ts`
- `ui/src/ui/navigation.ts`

**Changes:**

1. Ensure session key syncs to URL on switch
2. Handle browser back/forward
3. Clean URL when appropriate

**Test:**

```bash
# Test URL parameters:
# http://localhost:5173/?session=work
# Verify session switches correctly
# Use browser back button, verify it works
```

## Step 13: Write Unit Tests 🧪

**Files to create:**

- `src/gateway/server-methods/sessions.create.test.ts`
- `src/gateway/server-methods/sessions.reset-persistent.test.ts`
- `src/config/sessions/migration.test.ts`

**Test:**

```bash
npm test -- sessions
```

## Step 14: Write Integration Tests 🧪

**Files to create:**

- `src/e2e/named-sessions.e2e.test.ts`

**Test scenarios:**

1. Create named session → verify appears in list
2. Switch to named session → verify context isolated
3. Try to reset persistent session → verify blocked
4. Reset non-persistent session → verify works
5. Delete persistent session → verify removed

**Test:**

```bash
npm run test:e2e
```

## Step 15: Documentation 📚

**Files to create/modify:**

- `docs/features/named-sessions.md`
- `docs/api/sessions.md`
- `docs/configuration.md` (add session config options)
- `CHANGELOG.md`

**Test:**

- Review documentation for clarity
- Test all documented features

## Step 16: Final Polish & Cleanup ✨

**Tasks:**

1. Remove debug logging
2. Add error handling
3. Add loading states
4. Add user feedback (toasts/notifications)
5. Optimize performance
6. Code review checklist

**Test:**

```bash
# Full manual test:
1. Create 3 named sessions
2. Switch between them
3. Have different conversations in each
4. Try to reset a persistent one (should fail)
5. Reset a non-persistent one (should work)
6. Reload page
7. Verify sessions persist
8. Delete a session
9. Verify it's gone
```

## Rollout Strategy

### Phase 1: Internal Testing

- Deploy to dev environment
- Test with 2-3 internal users
- Gather feedback
- Fix bugs

### Phase 2: Beta Release

- Deploy to beta channel
- Add feature flag: `session.namedSessionsEnabled`
- Opt-in beta testers
- Monitor usage and bugs

### Phase 3: General Availability

- Enable by default
- Announce in changelog
- Update main documentation
- Monitor support requests

## Rollback Plan

If critical bugs are discovered:

1. **Quick fix:** Set feature flag to false

   ```yaml
   session:
     namedSessionsEnabled: false
   ```

2. **Database rollback:** Not needed - backward compatible

3. **Code rollback:**
   ```bash
   git revert <merge-commit>
   ```

## Performance Considerations

- **Session store size**: Monitor growth
- **List performance**: Add pagination if >100 sessions
- **Memory usage**: Cache session list with TTL
- **Disk I/O**: Use existing file lock mechanism

## Monitoring

Add metrics to track:

- Number of named sessions created per user
- Session switch frequency
- Failed reset attempts (persistent sessions)
- Session creation errors
- Average sessions per user

## Success Metrics

After 2 weeks of GA:

- [ ] > 10% of users create named sessions
- [ ] <0.1% error rate on session creation
- [ ] No P0/P1 bugs reported
- [ ] Positive user feedback (>80% satisfaction)
- [ ] <5ms latency increase on session operations

## Next Steps (Future Enhancements)

1. **Session templates**: Preset configurations
2. **Session sharing**: Share session URL with team
3. **Session archives**: Archive old sessions instead of delete
4. **Session export**: Export conversation as markdown
5. **Session analytics**: Usage stats per session
6. **Session tags**: Categorize sessions
7. **Session search**: Search across sessions
8. **Session merge**: Combine multiple sessions
