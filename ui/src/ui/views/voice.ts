import { html, nothing } from "lit";

import type { VoiceSessionInfo, VoiceTranscript } from "../controllers/voice";

// ── Props ─────────────────────────────────────────────────────────────────────

export type VoiceProps = {
  loading: boolean;
  session: VoiceSessionInfo | null;
  error: string | null;
  busy: boolean;
  sessionKey: string;
  transcript: VoiceTranscript[];
  onRefresh: () => void;
  onStart: () => void;
  onEnd: () => void;
  onSessionKeyChange: (next: string) => void;
};

// ── Main Render ───────────────────────────────────────────────────────────────

export function renderVoice(props: VoiceProps) {
  const isActive = props.session?.active === true;
  const sessionState = props.session?.state ?? "ended";

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Voice</div>
          <div class="card-sub">Manage ElevenLabs conversational voice sessions.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>

      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}

      ${renderStatusCard(isActive, sessionState, props)}
    </section>

    ${renderControls(isActive, props)}

    ${props.transcript.length > 0 ? renderTranscript(props.transcript) : nothing}
  `;
}

// ── Status Card ───────────────────────────────────────────────────────────────

function renderStatusCard(
  isActive: boolean,
  sessionState: string,
  props: VoiceProps,
) {
  const stateDisplay = stateLabel(sessionState);

  return html`
    <div style="margin-top: 16px; padding: 16px; background: var(--bg-2, #1a1a2e); border-radius: 8px;">
      <div class="row" style="gap: 16px; align-items: center;">
        <div style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${isActive ? "var(--accent, #4ade80)" : "var(--bg-3, #2a2a4a)"}; transition: background 0.3s;">
          ${renderMicIcon(isActive)}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 16px;">
            ${isActive ? "Session Active" : "No Active Session"}
          </div>
          <div class="chip-row" style="margin-top: 6px; gap: 6px;">
            <span class="chip ${stateDisplay.cls}">${stateDisplay.label}</span>
            ${props.session?.sessionKey
              ? html`<span class="chip">${props.session.sessionKey}</span>`
              : nothing}
            ${props.session?.durationMs != null
              ? html`<span class="chip">${formatDuration(props.session.durationMs)}</span>`
              : nothing}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Controls ──────────────────────────────────────────────────────────────────

function renderControls(isActive: boolean, props: VoiceProps) {
  return html`
    <section class="card">
      <div class="card-title" style="font-size: 14px;">Session Controls</div>

      <div class="field" style="margin-top: 12px;">
        <label>Session Key</label>
        <input
          type="text"
          class="input"
          placeholder="main"
          .value=${props.sessionKey}
          ?disabled=${isActive}
          @input=${(e: Event) =>
            props.onSessionKeyChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="row" style="gap: 8px; margin-top: 12px;">
        ${isActive
          ? html`
              <button
                class="btn danger"
                ?disabled=${props.busy}
                @click=${props.onEnd}
              >
                ${props.busy ? "Ending\u2026" : "End Session"}
              </button>
            `
          : html`
              <button
                class="btn primary"
                ?disabled=${props.busy}
                @click=${props.onStart}
              >
                ${props.busy ? "Starting\u2026" : "Start Voice Session"}
              </button>
            `}
      </div>
    </section>
  `;
}

// ── Transcript ────────────────────────────────────────────────────────────────

function renderTranscript(transcript: VoiceTranscript[]) {
  return html`
    <section class="card">
      <div class="card-title">Transcript</div>
      <div class="card-sub" style="margin-bottom: 12px;">
        Live conversation transcript.
      </div>
      <div class="list">
        ${transcript.map((entry) => renderTranscriptEntry(entry))}
      </div>
    </section>
  `;
}

function renderTranscriptEntry(entry: VoiceTranscript) {
  const isUser = entry.speaker === "user";
  return html`
    <div class="list-item" style="padding: 8px 0;">
      <div class="list-main">
        <div class="chip-row" style="gap: 6px;">
          <span class="chip ${isUser ? "" : "chip-ok"}" style="font-size: 11px;">
            ${isUser ? "You" : "Agent"}
          </span>
          <span class="muted" style="font-size: 11px;">
            ${new Date(entry.ts).toLocaleTimeString()}
          </span>
        </div>
        <div style="margin-top: 4px; font-size: 13px; line-height: 1.5;">
          ${entry.text}
        </div>
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stateLabel(state: string): { label: string; cls: string } {
  switch (state) {
    case "connecting":
      return { label: "Connecting", cls: "" };
    case "listening":
      return { label: "Listening", cls: "chip-ok" };
    case "thinking":
      return { label: "Thinking", cls: "" };
    case "speaking":
      return { label: "Speaking", cls: "chip-ok" };
    case "ended":
      return { label: "Ended", cls: "" };
    default:
      return { label: state || "Idle", cls: "" };
  }
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${remaining}s`;
}

function renderMicIcon(active: boolean) {
  const color = active ? "#000" : "#888";
  return html`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  `;
}
