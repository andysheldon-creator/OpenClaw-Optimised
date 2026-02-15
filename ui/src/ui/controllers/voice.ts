import type { GatewayBrowserClient } from "../gateway";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceTranscript = {
  speaker: "user" | "agent";
  text: string;
  ts: number;
};

export type VoiceSessionInfo = {
  active: boolean;
  state?: "connecting" | "listening" | "thinking" | "speaking" | "ended";
  sessionKey?: string;
  sessionId?: string;
  durationMs?: number;
  transcript?: VoiceTranscript[];
};

// ── State ─────────────────────────────────────────────────────────────────────

export type VoiceState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  voiceLoading: boolean;
  voiceSession: VoiceSessionInfo | null;
  voiceError: string | null;
  voiceBusy: boolean;
  voiceSessionKey: string;
  voiceTranscript: VoiceTranscript[];
};

// ── Load Voice Status ─────────────────────────────────────────────────────────

export async function loadVoiceStatus(state: VoiceState) {
  if (!state.client || !state.connected) return;
  if (state.voiceLoading) return;
  state.voiceLoading = true;
  state.voiceError = null;
  try {
    const res = (await state.client.request("voice.status", {
      sessionKey: state.voiceSessionKey || "main",
    })) as VoiceSessionInfo | undefined;
    state.voiceSession = res ?? null;
    if (res?.transcript) {
      state.voiceTranscript = res.transcript;
    }
  } catch (err) {
    state.voiceError = String(err);
  } finally {
    state.voiceLoading = false;
  }
}

// ── Start Voice Session ───────────────────────────────────────────────────────

export async function startVoiceSession(state: VoiceState) {
  if (!state.client || !state.connected) return;
  state.voiceBusy = true;
  state.voiceError = null;
  state.voiceTranscript = [];
  try {
    const res = (await state.client.request("voice.start", {
      sessionKey: state.voiceSessionKey || "main",
    })) as { sessionId?: string; sessionKey?: string } | undefined;
    state.voiceSession = {
      active: true,
      state: "connecting",
      sessionKey: res?.sessionKey,
      sessionId: res?.sessionId,
    };
  } catch (err) {
    state.voiceError = String(err);
  } finally {
    state.voiceBusy = false;
  }
}

// ── End Voice Session ─────────────────────────────────────────────────────────

export async function endVoiceSession(state: VoiceState) {
  if (!state.client || !state.connected) return;
  state.voiceBusy = true;
  try {
    const res = (await state.client.request("voice.end", {
      sessionKey: state.voiceSessionKey || "main",
    })) as { summary?: { transcript?: VoiceTranscript[]; durationMs?: number } } | undefined;
    if (res?.summary?.transcript) {
      state.voiceTranscript = res.summary.transcript;
    }
    state.voiceSession = { active: false, state: "ended" };
  } catch (err) {
    state.voiceError = String(err);
  } finally {
    state.voiceBusy = false;
  }
}

// ── Handle Voice Events (called from app.ts onEvent) ──────────────────────────

export function handleVoiceStateEvent(
  state: VoiceState,
  payload: { state?: string; sessionKey?: string; ts?: number },
) {
  if (state.voiceSession) {
    state.voiceSession = {
      ...state.voiceSession,
      state: payload.state as VoiceSessionInfo["state"],
    };
  }
}

export function handleVoiceTranscriptEvent(
  state: VoiceState,
  payload: { text?: string; speaker?: string; sessionKey?: string; ts?: number },
) {
  if (payload.text && payload.speaker) {
    state.voiceTranscript = [
      ...state.voiceTranscript,
      {
        speaker: payload.speaker as "user" | "agent",
        text: payload.text,
        ts: payload.ts ?? Date.now(),
      },
    ];
  }
}
