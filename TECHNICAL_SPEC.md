# Technical Specification: Named Persistent Sessions

## 1. Database Schema Changes

### File: `src/config/sessions/types.ts`

```typescript
export type SessionEntry = {
  // ... existing fields ...

  /**
   * If true, this session will not be reset by /new or /reset commands.
   * User must explicitly delete or switch away from persistent sessions.
   */
  persistent?: boolean;

  /**
   * If true, this session was created explicitly by the user (not auto-generated).
   * Used to distinguish named sessions in UI.
   */
  userCreated?: boolean;

  /**
   * Optional display name for the session (already exists, but document usage).
   * For named sessions, this should always be set.
   */
  label?: string;

  /**
   * Optional description or notes about this session.
   * Helps users remember what this session is for.
   */
  description?: string;

  /**
   * Timestamp when this session was created (not just updated).
   */
  createdAt?: number;
};
```

## 2. Backend API: New Endpoint

### File: `src/gateway/protocol/index.ts`

Add new request/response types:

```typescript
export type SessionsCreateParams = {
  /** Human-readable name/label for the session */
  label: string;
  /** Optional longer description */
  description?: string;
  /** Make this session persistent (default: true) */
  persistent?: boolean;
  /** Agent ID to create session for (default: main agent) */
  agentId?: string;
  /** Copy settings from existing session */
  basedOn?: string;
};

export type SessionsCreateResult = {
  ok: boolean;
  /** The canonical session key */
  key: string;
  /** The session ID (UUID) */
  sessionId: string;
  /** The session entry */
  entry: SessionEntry;
};

// Add to validator
export const SessionsCreateParamsSchema = Type.Object({
  label: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  persistent: Type.Optional(Type.Boolean()),
  agentId: Type.Optional(Type.String()),
  basedOn: Type.Optional(Type.String()),
});
```

### File: `src/gateway/server-methods-list.ts`

```typescript
export const GATEWAY_SERVER_METHODS = [
  // ... existing methods ...
  "sessions.create",
] as const;
```

### File: `src/gateway/server-methods/sessions.ts`

Add new handler:

```typescript
"sessions.create": async ({ params, respond }) => {
  if (!validateSessionsCreateParams(params)) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        `invalid sessions.create params: ${formatValidationErrors(validateSessionsCreateParams.errors)}`,
      ),
    );
    return;
  }

  const p = params as SessionsCreateParams;
  const label = p.label.trim();

  if (!label) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "label required"));
    return;
  }

  const cfg = loadConfig();
  const agentId = normalizeAgentId(p.agentId ?? resolveDefaultAgentId(cfg));

  // Generate unique session key
  const sessionId = randomUUID();
  const sessionKey = `agent:${agentId}:named:${sessionId}`;

  const now = Date.now();
  const persistent = p.persistent !== false; // default to true

  // Copy settings from basedOn session if provided
  let baseEntry: SessionEntry | undefined;
  if (p.basedOn) {
    const baseTarget = resolveGatewaySessionStoreTarget({ cfg, key: p.basedOn });
    const baseStore = loadSessionStore(baseTarget.storePath);
    baseEntry = baseStore[baseTarget.storeKeys[0] ?? p.basedOn];
  }

  const entry: SessionEntry = {
    sessionId,
    updatedAt: now,
    createdAt: now,
    systemSent: false,
    abortedLastRun: false,
    persistent,
    userCreated: true,
    label,
    description: p.description?.trim(),
    // Copy preferences from base session if provided
    thinkingLevel: baseEntry?.thinkingLevel,
    verboseLevel: baseEntry?.verboseLevel,
    reasoningLevel: baseEntry?.reasoningLevel,
    responseUsage: baseEntry?.responseUsage,
    modelOverride: baseEntry?.modelOverride,
    providerOverride: baseEntry?.providerOverride,
    // Start fresh with zero tokens
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    contextTokens: 0,
  };

  const target = resolveGatewaySessionStoreTarget({ cfg, key: sessionKey });
  await updateSessionStore(target.storePath, (store) => {
    store[sessionKey] = entry;
  });

  respond(true, { ok: true, key: sessionKey, sessionId, entry }, undefined);
},
```

Modify reset handler to check persistent flag:

```typescript
"sessions.reset": async ({ params, respond }) => {
  // ... existing validation ...

  const cfg = loadConfig();
  const target = resolveGatewaySessionStoreTarget({ cfg, key });
  const storePath = target.storePath;

  // Check if session is persistent
  const store = loadSessionStore(storePath);
  const primaryKey = target.storeKeys[0] ?? key;
  const existingKey = target.storeKeys.find((candidate) => store[candidate]);
  const entry = store[existingKey ?? primaryKey];

  if (entry?.persistent === true) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        `Cannot reset persistent session "${entry.label || key}". ` +
        `Use sessions.delete to clear it, or switch to a different session.`,
      ),
    );
    return;
  }

  // ... rest of existing reset logic ...
},
```

## 3. Frontend: Gateway Client Method

### File: `ui/src/ui/gateway.ts`

Add new method:

```typescript
export type SessionCreateRequest = {
  label: string;
  description?: string;
  persistent?: boolean;
  basedOn?: string;
};

export type SessionCreateResponse = {
  ok: boolean;
  key: string;
  sessionId: string;
  entry: Record<string, unknown>;
};

// In GatewayBrowserClient class:
async createSession(req: SessionCreateRequest): Promise<SessionCreateResponse> {
  return await this.request<SessionCreateResponse>("sessions.create", req);
}
```

## 4. Frontend: Session Controller

### File: `ui/src/ui/controllers/sessions.ts`

Add new functions:

```typescript
export async function createSession(
  state: SessionsState,
  params: {
    label: string;
    description?: string;
    persistent?: boolean;
    basedOn?: string;
  },
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }

  try {
    const res = await state.client.request<{
      ok: boolean;
      key: string;
      sessionId: string;
      entry: unknown;
    }>("sessions.create", params);

    if (res?.ok && res.key) {
      await loadSessions(state);
      return res.key;
    }
    return null;
  } catch (err) {
    state.sessionsError = String(err);
    return null;
  }
}

export async function switchSession(state: SessionsState, key: string): Promise<boolean> {
  // Validation
  if (!state.client || !state.connected || !key) {
    return false;
  }

  // Just return success - actual switching is done via URL update
  return true;
}
```

## 5. Frontend: Session Switcher Component

### File: `ui/src/ui/components/session-switcher.ts`

New component:

```typescript
import { html, css, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { SessionsState } from "../controllers/sessions.ts";

@customElement("session-switcher")
export class SessionSwitcher extends LitElement {
  @property({ type: Object }) state!: SessionsState;
  @property({ type: String }) currentKey = "main";
  @state() private showDropdown = false;
  @state() private showCreateDialog = false;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .switcher-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      cursor: pointer;
      font-size: 14px;
    }

    .switcher-button:hover {
      background: var(--bg-hover);
    }

    .session-label {
      font-weight: 500;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      min-width: 280px;
      max-height: 400px;
      overflow-y: auto;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
    }

    .session-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-color);
    }

    .session-item:hover {
      background: var(--bg-hover);
    }

    .session-item.active {
      background: var(--accent-bg);
      color: var(--accent-text);
    }

    .persistent-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--success-bg);
      color: var(--success-text);
    }

    .new-session-button {
      display: block;
      width: 100%;
      padding: 10px 12px;
      text-align: center;
      background: var(--accent-bg);
      color: var(--accent-text);
      border: none;
      cursor: pointer;
      font-weight: 500;
    }

    .new-session-button:hover {
      background: var(--accent-hover);
    }
  `;

  render() {
    const currentSession = this.state.sessionsResult?.sessions?.find(
      (s) => s.key === this.currentKey,
    );
    const currentLabel = currentSession?.label || this.currentKey || "Main";
    const isPersistent = currentSession?.persistent === true;

    return html`
      <div class="switcher-container">
        <button class="switcher-button" @click=${() => (this.showDropdown = !this.showDropdown)}>
          <span class="session-label">${currentLabel}</span>
          ${isPersistent ? html`<span class="persistent-badge">📌</span>` : ""}
          <span>▼</span>
        </button>

        ${this.showDropdown
          ? html`
              <div class="dropdown" @click=${(e: Event) => e.stopPropagation()}>
                ${this.state.sessionsResult?.sessions?.slice(0, 10).map(
                  (session) => html`
                    <div
                      class="session-item ${session.key === this.currentKey ? "active" : ""}"
                      @click=${() => this.switchTo(session.key)}
                    >
                      <span>${session.label || session.key}</span>
                      ${session.persistent ? html`<span class="persistent-badge">📌</span>` : ""}
                    </div>
                  `,
                )}

                <button class="new-session-button" @click=${() => this.openCreateDialog()}>
                  + New Session
                </button>
              </div>
            `
          : ""}
        ${this.showCreateDialog ? this.renderCreateDialog() : ""}
      </div>
    `;
  }

  private switchTo(key: string) {
    this.showDropdown = false;
    // Update URL to switch session
    const url = new URL(window.location.href);
    url.searchParams.set("session", key);
    window.history.pushState({}, "", url.toString());
    window.location.reload(); // Or trigger app state update
  }

  private openCreateDialog() {
    this.showDropdown = false;
    this.showCreateDialog = true;
  }

  private renderCreateDialog() {
    return html`
      <div class="dialog-overlay" @click=${() => (this.showCreateDialog = false)}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Create New Session</h3>
          <input type="text" id="session-label" placeholder="Session name" />
          <textarea id="session-desc" placeholder="Description (optional)"></textarea>
          <label>
            <input type="checkbox" id="session-persistent" checked />
            Make persistent (won't reset on /new)
          </label>
          <div class="dialog-buttons">
            <button @click=${() => (this.showCreateDialog = false)}>Cancel</button>
            <button @click=${this.handleCreate}>Create & Switch</button>
          </div>
        </div>
      </div>
    `;
  }

  private async handleCreate() {
    const labelInput = this.shadowRoot?.querySelector<HTMLInputElement>("#session-label");
    const descInput = this.shadowRoot?.querySelector<HTMLTextAreaElement>("#session-desc");
    const persistentInput = this.shadowRoot?.querySelector<HTMLInputElement>("#session-persistent");

    const label = labelInput?.value.trim();
    if (!label) {
      alert("Please enter a session name");
      return;
    }

    const key = await createSession(this.state, {
      label,
      description: descInput?.value.trim(),
      persistent: persistentInput?.checked !== false,
    });

    if (key) {
      this.showCreateDialog = false;
      this.switchTo(key);
    } else {
      alert("Failed to create session");
    }
  }
}
```

## 6. Integration: Add Switcher to Chat Header

### File: `ui/src/ui/views/chat.ts` (or wherever chat header is rendered)

```typescript
import "../components/session-switcher.ts";

// In chat header render:
html`
  <div class="chat-header">
    <session-switcher
      .state=${this.sessionsState}
      .currentKey=${this.sessionKey}
    ></session-switcher>

    <!-- rest of header -->
  </div>
`;
```

## 7. Command Handlers

### File: `src/auto-reply/commands-registry.data.ts`

```typescript
{
  id: "session-new",
  textAlias: "/session new",
  description: "Create a new named session",
  requiresAuthorization: true,
  handler: async (ctx, args) => {
    const label = args.trim();
    if (!label) {
      return { text: "Usage: /session new <name>" };
    }

    // Call gateway to create session
    const result = await callGateway({
      method: "sessions.create",
      params: { label, persistent: true },
    });

    if (result?.ok) {
      return {
        text: `✓ Created session "${label}". Switch: ${window.location.origin}?session=${result.key}`,
      };
    }
    return { text: "Failed to create session." };
  },
},
```

## 8. Migration Strategy

### File: `src/config/sessions/migration.ts` (new file)

```typescript
/**
 * Migrate existing sessions to add default values for new fields.
 */
export function migrateSessionStore(store: Record<string, SessionEntry>): boolean {
  let modified = false;

  for (const [key, entry] of Object.entries(store)) {
    if (!entry) continue;

    // Add createdAt if missing (use updatedAt as fallback)
    if (!entry.createdAt && entry.updatedAt) {
      entry.createdAt = entry.updatedAt;
      modified = true;
    }

    // Default persistent to false for existing sessions
    if (entry.persistent === undefined) {
      entry.persistent = false;
      modified = true;
    }

    // Mark main session as non-user-created
    if (key === "main" && entry.userCreated === undefined) {
      entry.userCreated = false;
      modified = true;
    }
  }

  return modified;
}
```

Call this in `loadSessionStore` after loading:

```typescript
export function loadSessionStore(storePath: string): Record<string, SessionEntry> {
  // ... existing load logic ...

  // Run migration
  const modified = migrateSessionStore(store);
  if (modified) {
    // Save migrated store
    saveSessionStore(storePath, store).catch(() => {});
  }

  return store;
}
```

## Testing Checklist

- [ ] Create new named session via UI
- [ ] Create new named session via `/session new` command
- [ ] Switch between sessions using dropdown
- [ ] Switch between sessions using URL parameter
- [ ] Verify `/new` is blocked on persistent sessions
- [ ] Verify `/new` works on non-persistent sessions
- [ ] Verify sessions appear in sessions list with badges
- [ ] Verify session labels are editable
- [ ] Verify persistent flag is toggleable
- [ ] Verify session deletion works
- [ ] Test with multiple browser tabs
- [ ] Test session creation with `basedOn` parameter
- [ ] Verify migration doesn't break existing sessions
