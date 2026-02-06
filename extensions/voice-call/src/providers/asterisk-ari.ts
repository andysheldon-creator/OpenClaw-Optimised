import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";
import type { VoiceCallConfig } from "../config.js";
import type { CallManager } from "../manager.js";
import type {
  HangupCallInput,
  InitiateCallInput,
  InitiateCallResult,
  PlayTtsInput,
  ProviderWebhookParseResult,
  StartListeningInput,
  StopListeningInput,
  WebhookContext,
  WebhookVerificationResult,
  NormalizedEvent,
} from "../types.js";
import type { VoiceCallProvider } from "./base.js";
import { convertPcmToMulaw8k, chunkAudio } from "../telephony-audio.js";
import { OpenAIRealtimeSTTProvider } from "./stt-openai-realtime.js";
import { OpenAITTSProvider } from "./tts-openai.js";

type AriConfig = NonNullable<VoiceCallConfig["asteriskAri"]>;

type AriEvent = {
  type: string;
  application?: string;
  timestamp?: string;
  channel?: {
    id: string;
    name?: string;
    state?: string;
    caller?: { number?: string };
    connected?: { number?: string };
  };
  args?: string[];
};

const execFileAsync = promisify(execFile);

function nowMs(): number {
  return Date.now();
}

function makeEvent(partial: Omit<NormalizedEvent, "id" | "timestamp">): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: nowMs(),
    ...partial,
  } as NormalizedEvent;
}

function basicAuthHeader(user: string, pass: string): string {
  const token = Buffer.from(user + ":" + pass).toString("base64");
  return "Basic " + token;
}

async function ariFetchJson(params: {
  baseUrl: string;
  username: string;
  password: string;
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(params.baseUrl.replace(/\/$/, "") + "/ari" + params.path);
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      if (v === undefined) {
        continue;
      }
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: params.method ?? "GET",
    headers: {
      Authorization: basicAuthHeader(params.username, params.password),
      "Content-Type": "application/json",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("ARI HTTP " + res.status + " " + res.statusText + (txt ? ": " + txt : ""));
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

export class AsteriskAriProvider implements VoiceCallProvider {
  readonly name = "asterisk-ari" as const;

  private cfg: AriConfig;
  private manager: CallManager;

  private ws: WebSocket | null = null;
  private udp: dgram.Socket;

  // providerCallId -> state
  private callMap = new Map<
    string,
    {
      callId: string;
      sipChannelId: string;
      extChannelId: string;
      bridgeId: string;
      rtpPeer?: { address: string; port: number };
      stt?: ReturnType<OpenAIRealtimeSTTProvider["createSession"]>;
      speaking: boolean;
    }
  >();

  // Outbound calls: we need to wait for StasisStart before issuing bridge/externalMedia actions.
  private pendingStasisStart = new Map<
    string,
    { resolve: () => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }
  >();

  constructor(params: { config: VoiceCallConfig; manager: CallManager }) {
    const a = params.config.asteriskAri;
    if (!a) {
      throw new Error("asteriskAri config missing");
    }
    this.cfg = a;
    this.manager = params.manager;

    this.udp = dgram.createSocket("udp4");
    this.udp.on("message", (msg, rinfo) => this.onRtp(msg, rinfo));
    this.udp.bind(this.cfg.rtpPort, "0.0.0.0");

    this.connectWs();
  }

  verifyWebhook(_ctx: WebhookContext): WebhookVerificationResult {
    return { ok: true };
  }

  parseWebhookEvent(_ctx: WebhookContext): ProviderWebhookParseResult {
    return { events: [], statusCode: 200, providerResponseBody: "OK" };
  }

  private async safeHangupChannel(channelId: string | undefined) {
    const id = (channelId || "").trim();
    if (!id) {
      return;
    }

    // ARI supports different hangup semantics depending on channel type.
    // - Normal SIP channels generally work with POST /channels/{id}/hangup
    // - ExternalMedia (UnicastRTP/...) often does NOT expose /hangup and must be deleted: DELETE /channels/{id}
    try {
      await ariFetchJson({
        baseUrl: this.cfg.baseUrl,
        username: this.cfg.username,
        password: this.cfg.password,
        path: "/channels/" + encodeURIComponent(id) + "/hangup",
        method: "POST",
      });
      return;
    } catch {
      // fall through
    }

    try {
      await ariFetchJson({
        baseUrl: this.cfg.baseUrl,
        username: this.cfg.username,
        password: this.cfg.password,
        path: "/channels/" + encodeURIComponent(id),
        method: "DELETE",
      });
    } catch {
      // ignore
    }
  }

  private async cleanupStaleExternalMedia() {
    // Kill any orphaned UnicastRTP channels that are still in our Stasis app.
    // This can happen if the gateway restarts or ARI WS drops before we get StasisEnd.
    const channels = await ariFetchJson({
      baseUrl: this.cfg.baseUrl,
      username: this.cfg.username,
      password: this.cfg.password,
      path: "/channels",
      method: "GET",
    });

    if (!Array.isArray(channels)) {
      return;
    }

    const activeExt = new Set<string>();
    for (const st of this.callMap.values()) {
      if (st.extChannelId) {
        activeExt.add(st.extChannelId);
      }
    }

    for (const ch of channels) {
      const chObj = ch as Record<string, unknown>;

      const id = typeof chObj.id === "string" ? chObj.id : "";
      const name = typeof chObj.name === "string" ? chObj.name : "";

      const dp =
        typeof chObj.dialplan === "object" && chObj.dialplan
          ? (chObj.dialplan as Record<string, unknown>)
          : undefined;

      const appName = typeof dp?.app_name === "string" ? dp.app_name : "";
      const appData = typeof dp?.app_data === "string" ? dp.app_data : "";
      if (!id || !name) {
        continue;
      }
      // ExternalMedia channels show up as dialplan Stasis(<app>) in ARI channel.dialplan fields.
      if (appName != "Stasis" || appData !== this.cfg.app) {
        continue;
      }
      if (!name.startsWith("UnicastRTP/")) {
        continue;
      }
      if (activeExt.has(id)) {
        continue;
      }
      await this.safeHangupChannel(id);
    }
  }

  private connectWs() {
    const base = this.cfg.baseUrl.replace(/\/$/, "");
    const wsBase = base.replace(/^http/, "ws");
    const qp = new URLSearchParams({
      app: this.cfg.app,
      api_key: this.cfg.username + ":" + this.cfg.password,
    });
    const url = wsBase + "/ari/events?" + qp.toString();

    this.ws = new WebSocket(url);
    this.ws.on("open", () => {
      // Best-effort recovery: if the gateway previously crashed or missed StasisEnd events,
      // Asterisk may still have orphaned UnicastRTP ExternalMedia channels in our Stasis app.
      // Clean them up to avoid leaking channels and breaking RTP peer learning.
      void this.cleanupStaleExternalMedia().catch(() => undefined);
    });
    this.ws.on("message", (data) => {
      let evt: AriEvent | null = null;
      if (!(typeof data === "string" || Buffer.isBuffer(data))) {
        return;
      }

      try {
        evt = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!evt) {
        return;
      }
      this.onAriEvent(evt);
    });
    this.ws.on("close", () => {
      // reconnect
      setTimeout(() => this.connectWs(), 1500);
    });
    this.ws.on("error", () => {
      // ignore; reconnect via close
    });
  }

  private onAriEvent(evt: AriEvent) {
    // Outbound: resolve pending promise when the originated channel enters our Stasis app.
    if (evt.type === "StasisStart" && evt.channel?.id) {
      const chName = evt.channel?.name || "";
      // Only treat real inbound SIP calls as inbound. ExternalMedia (UnicastRTP/...) also enters Stasis and must be ignored,
      // otherwise we recursively create more ExternalMedia channels and leak resources.
      if (!chName.startsWith("PJSIP/")) {
        return;
      }

      const pending = this.pendingStasisStart.get(evt.channel.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingStasisStart.delete(evt.channel.id);
        pending.resolve();
        return;
      }
    }

    if (evt.type === "StasisStart" && evt.channel?.id) {
      // inbound call into this Stasis app
      const sipChannelId = evt.channel.id;
      const providerCallId = sipChannelId;
      const from = evt.channel?.caller?.number || "unknown";
      const to = evt.channel?.connected?.number || "unknown";

      const callId = crypto.randomUUID();
      this.callMap.set(providerCallId, {
        callId,
        sipChannelId,
        extChannelId: "",
        bridgeId: "",
        speaking: false,
      });

      this.manager.processEvent(
        makeEvent({
          type: "call.ringing",
          callId,
          providerCallId,
          direction: "inbound",
          from,
          to,
        }),
      );

      // Answer + attach external media. Any greeting should be handled at a higher level.
      void this.setupConversation({ providerCallId, sipChannelId, isOutbound: false });
    }

    if (evt.type === "StasisEnd" && evt.channel?.id) {
      const channelId = evt.channel.id;

      // Inbound: providerCallId == sip channel id
      if (this.callMap.has(channelId)) {
        const providerCallId = channelId;
        const st = this.callMap.get(providerCallId);
        if (!st) {
          return;
        }
        this.manager.processEvent(
          makeEvent({
            type: "call.ended",
            callId: st.callId,
            providerCallId,
            reason: "completed",
          }),
        );
        this.cleanup(providerCallId).catch(() => undefined);
        return;
      }

      // Outbound: providerCallId is a UUID; find matching state by sipChannelId
      for (const [providerCallId, st] of this.callMap.entries()) {
        if (st.sipChannelId === channelId) {
          this.manager.processEvent(
            makeEvent({
              type: "call.ended",
              callId: st.callId,
              providerCallId,
              reason: "completed",
            }),
          );
          this.cleanup(providerCallId).catch(() => undefined);
          return;
        }
      }
    }
  }

  private onRtp(msg: Buffer, rinfo: dgram.RemoteInfo) {
    // Find matching call by rinfo; externalMedia should send RTP from Asterisk to our port.
    // We keep the last seen peer per active call.
    // RTP header is 12 bytes.
    if (msg.length <= 12) {
      return;
    }
    const payload = msg.subarray(12);

    for (const [_providerCallId, st] of this.callMap.entries()) {
      if (!st.extChannelId) {
        continue;
      }
      // Learn peer first packet.
      if (!st.rtpPeer) {
        st.rtpPeer = { address: rinfo.address, port: rinfo.port };
      }
      // Only accept from learned peer.
      if (st.rtpPeer.address !== rinfo.address || st.rtpPeer.port !== rinfo.port) {
        continue;
      }

      // Always feed inbound RTP into STT, even while we're speaking.
      // Otherwise onSpeechStart never fires and barge-in can't interrupt TTS.
      if (st.stt) {
        st.stt.sendAudio(payload);
      }
    }
  }

  private async setupConversation(params: {
    providerCallId: string;
    sipChannelId: string;
    isOutbound: boolean;
  }) {
    const providerCallId = params.providerCallId;
    const st = this.callMap.get(providerCallId);
    if (!st) {
      return;
    }

    // Answer channel (inbound) if needed
    try {
      await ariFetchJson({
        baseUrl: this.cfg.baseUrl,
        username: this.cfg.username,
        password: this.cfg.password,
        path: "/channels/" + encodeURIComponent(params.sipChannelId) + "/answer",
        method: "POST",
      });
    } catch {
      // ignore
    }

    // Create mixing bridge
    const bridge = await ariFetchJson({
      baseUrl: this.cfg.baseUrl,
      username: this.cfg.username,
      password: this.cfg.password,
      path: "/bridges",
      method: "POST",
      query: { type: "mixing" },
    });
    const bridgeId = bridge.id as string;

    // Create ExternalMedia channel
    const ext = await ariFetchJson({
      baseUrl: this.cfg.baseUrl,
      username: this.cfg.username,
      password: this.cfg.password,
      path: "/channels/externalMedia",
      method: "POST",
      query: {
        app: this.cfg.app,
        external_host: this.cfg.rtpHost + ":" + this.cfg.rtpPort,
        format: this.cfg.format,
      },
    });
    const extChannelId = ext.id as string;

    // Add both channels to bridge
    await ariFetchJson({
      baseUrl: this.cfg.baseUrl,
      username: this.cfg.username,
      password: this.cfg.password,
      path: "/bridges/" + encodeURIComponent(bridgeId) + "/addChannel",
      method: "POST",
      query: { channel: params.sipChannelId + "," + extChannelId },
    });

    st.bridgeId = bridgeId;
    st.extChannelId = extChannelId;

    // STT session
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      // Allow basic call bridging even when STT is not configured.
      // (Streaming/STT can be enabled later by providing OPENAI_API_KEY.)
      this.manager.processEvent(
        makeEvent({
          type: "call.answered",
          callId: st.callId,
          providerCallId,
        }),
      );
      this.manager.processEvent(
        makeEvent({
          type: "call.active",
          callId: st.callId,
          providerCallId,
        }),
      );
      return;
    }
    const sttProvider = new OpenAIRealtimeSTTProvider({
      apiKey,
      model: process.env.OPENAI_REALTIME_STT_MODEL || undefined,
      silenceDurationMs: 800,
      vadThreshold: 0.5,
    });
    const session = sttProvider.createSession();
    await session.connect();
    session.onSpeechStart(() => {
      // barge-in: stop speaking
      const s = this.callMap.get(providerCallId);
      if (s) {
        s.speaking = false;
      }
    });
    session.onTranscript((t) => {
      const s = this.callMap.get(providerCallId);
      if (!s) {
        return;
      }
      this.manager.processEvent(
        makeEvent({
          type: "call.speech",
          callId: s.callId,
          providerCallId,
          transcript: t,
          isFinal: true,
        }),
      );
    });
    st.stt = session;

    // Mark answered
    this.manager.processEvent(
      makeEvent({
        type: "call.answered",
        callId: st.callId,
        providerCallId,
      }),
    );
    this.manager.processEvent(
      makeEvent({
        type: "call.active",
        callId: st.callId,
        providerCallId,
      }),
    );

    // For inbound calls, do not auto-speak here.
    // Let the higher-level CallManager / response generator decide what (if anything) to say.
  }

  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    const providerCallId = crypto.randomUUID();
    const callId = input.callId;

    // Create call state
    this.callMap.set(providerCallId, {
      callId,
      sipChannelId: "",
      extChannelId: "",
      bridgeId: "",
      speaking: false,
    });

    this.manager.processEvent(
      makeEvent({
        type: "call.initiated",
        callId,
        providerCallId,
        direction: "outbound",
        from: input.from,
        to: input.to,
      }),
    );

    // Originate channel into Stasis app
    // - If `to` already looks like a full dialstring (e.g. "PJSIP/1000" or "Local/1000@default"), use it as-is.
    // - Else, if trunk is configured, dial through it: PJSIP/<trunk>/<to>
    // - Else, dial the endpoint directly: PJSIP/<to>
    const endpoint = input.to.includes("/")
      ? input.to
      : this.cfg.trunk?.trim()
        ? `PJSIP/${this.cfg.trunk}/${input.to}`
        : `PJSIP/${input.to}`;
    const ch = await ariFetchJson({
      baseUrl: this.cfg.baseUrl,
      username: this.cfg.username,
      password: this.cfg.password,
      path: "/channels",
      method: "POST",
      query: {
        endpoint,
        app: this.cfg.app,
        callerId: input.fromName ? `${input.fromName} <${input.from}>` : undefined,
      },
    });

    const sipChannelId = ch.id as string;
    const st = this.callMap.get(providerCallId);
    if (st) {
      st.sipChannelId = sipChannelId;
    }

    this.manager.processEvent(
      makeEvent({
        type: "call.ringing",
        callId,
        providerCallId,
      }),
    );

    // Wait until channel is actually in our Stasis app (avoids 422 Channel not in Stasis application).
    // Best-effort: if it never enters Stasis, we still let the outbound call ring (basic telephony works).
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const pending = this.pendingStasisStart.get(sipChannelId);
          if (pending) {
            clearTimeout(pending.timeout);
          }
          this.pendingStasisStart.delete(sipChannelId);
          reject(new Error("Timed out waiting for StasisStart"));
        }, 8000);
        this.pendingStasisStart.set(sipChannelId, { resolve, reject, timeout });
      });

      // setup extMedia + (optional) STT session
      await this.setupConversation({ providerCallId, sipChannelId, isOutbound: true });
    } catch {
      // Degrade gracefully: call may still be ringing/answered outside Stasis.
    }

    return { providerCallId, status: "initiated" };
  }

  async hangupCall(input: HangupCallInput): Promise<void> {
    const st = this.callMap.get(input.providerCallId);
    if (!st) {
      return;
    }
    try {
      await ariFetchJson({
        baseUrl: this.cfg.baseUrl,
        username: this.cfg.username,
        password: this.cfg.password,
        path: "/channels/" + encodeURIComponent(st.sipChannelId) + "/hangup",
        method: "POST",
      });
    } catch {
      // ignore
    }
    await this.cleanup(input.providerCallId);
  }

  async playTts(input: PlayTtsInput): Promise<void> {
    const st = this.callMap.get(input.providerCallId);
    if (!st) {
      return;
    }

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();

    let mulaw: Buffer;
    if (apiKey) {
      const tts = new OpenAITTSProvider({ apiKey });
      const pcm24k = await tts.synthesize(input.text);
      mulaw = convertPcmToMulaw8k(pcm24k, 24000);
    } else {
      const wavPath = joinPath(tmpdir(), `openclaw-tts-${randomUUID()}.wav`);
      try {
        await execFileAsync("espeak-ng", ["-w", wavPath, input.text]);
        const wav = await readFile(wavPath);
        const { stdout } = await execFileAsync(
          "sox",
          ["-t", "wav", "-", "-t", "raw", "-r", "8000", "-c", "1", "-e", "mu-law", "-b", "8", "-"],
          { input: wav, maxBuffer: 50 * 1024 * 1024 },
        );
        mulaw = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
      } finally {
        try {
          await unlink(wavPath);
        } catch {}
      }
    }

    // Stream as RTP 20ms frames
    st.speaking = true;
    this.manager.processEvent(
      makeEvent({
        type: "call.speaking",
        callId: st.callId,
        providerCallId: input.providerCallId,
        text: input.text,
      }),
    );

    const peer = st.rtpPeer;
    if (!peer) {
      // We haven't learned RTP peer yet; wait a bit.
      await new Promise((r) => setTimeout(r, 300));
    }
    const peer2 = st.rtpPeer;
    if (!peer2) {
      throw new Error("No RTP peer learned yet");
    }

    let seq = 0;
    let ts = 0;
    const ssrc = 0x12345678;

    for (const frame of chunkAudio(mulaw, 160)) {
      if (!st.speaking) {
        break;
      }

      const header = Buffer.alloc(12);
      header[0] = 0x80;
      header[1] = 0x00;
      header.writeUInt16BE(seq & 0xffff, 2);
      header.writeUInt32BE(ts >>> 0, 4);
      header.writeUInt32BE(ssrc >>> 0, 8);
      seq++;
      ts += 160;

      const packet = Buffer.concat([header, frame]);
      await new Promise<void>((resolve, reject) => {
        this.udp.send(packet, peer2.port, peer2.address, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      await new Promise((r) => setTimeout(r, 20));
    }

    st.speaking = false;
  }

  async startListening(_input: StartListeningInput): Promise<void> {
    // STT is always on for now.
  }

  async stopListening(_input: StopListeningInput): Promise<void> {
    // STT is always on for now.
  }

  private async cleanup(providerCallId: string): Promise<void> {
    const st = this.callMap.get(providerCallId);
    if (!st) {
      return;
    }

    try {
      st.stt?.close();
    } catch {
      // ignore
    }

    // Best-effort tear down in reverse order.
    // IMPORTANT: ExternalMedia (UnicastRTP/...) can remain alive even if the bridge is deleted.
    // Always try to hang up the external channel to avoid leaking UnicastRTP channels.
    await this.safeHangupChannel(st.extChannelId);

    // Optionally hang up the SIP channel as well (bridge deletion + SIP hangup should end the call anyway).
    // This is best-effort; if the call was already hung up, ARI will error.
    await this.safeHangupChannel(st.sipChannelId);

    try {
      if (st.bridgeId) {
        await ariFetchJson({
          baseUrl: this.cfg.baseUrl,
          username: this.cfg.username,
          password: this.cfg.password,
          path: "/bridges/" + encodeURIComponent(st.bridgeId),
          method: "DELETE",
        });
      }
    } catch {
      // ignore
    }

    this.callMap.delete(providerCallId);
  }
}
