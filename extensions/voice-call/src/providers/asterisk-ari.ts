import dgram from "node:dgram";
import crypto from "node:crypto";
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
import { OpenAIRealtimeSTTProvider } from "./stt-openai-realtime.js";
import { OpenAITTSProvider } from "./tts-openai.js";
import { convertPcmToMulaw8k, chunkAudio } from "../telephony-audio.js";

type AriConfig = NonNullable<VoiceCallConfig["asteriskAri"]>;

type AriEvent = {
  type: string;
  application?: string;
  timestamp?: string;
  channel?: { id: string; name?: string; state?: string; caller?: { number?: string }; connected?: { number?: string } };
  args?: string[];
};

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
}): Promise<any> {
  const url = new URL(params.baseUrl.replace(/\/$/, "") + "/ari" + params.path);
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      if (v === undefined) continue;
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

  private connectWs() {
    const base = this.cfg.baseUrl.replace(/\/$/, "");
    const wsBase = base.replace(/^http/, "ws");
    const qp = new URLSearchParams({ app: this.cfg.app, api_key: this.cfg.username + ":" + this.cfg.password });
    const url = wsBase + "/ari/events?" + qp.toString();

    this.ws = new WebSocket(url);
    this.ws.on("open", () => {
      // ok
    });
    this.ws.on("message", (data) => {
      let evt: AriEvent | null = null;
      try {
        evt = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!evt) return;
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

      // Answer + attach external media + speak greeting
      void this.setupConversation({ providerCallId, sipChannelId, isOutbound: false });
    }

    if (evt.type === "StasisEnd" && evt.channel?.id) {
      const providerCallId = evt.channel.id;
      const st = this.callMap.get(providerCallId);
      if (!st) return;
      this.manager.processEvent(
        makeEvent({
          type: "call.ended",
          callId: st.callId,
          providerCallId,
          reason: "completed",
        }),
      );
      this.cleanup(providerCallId).catch(() => undefined);
    }
  }

  private onRtp(msg: Buffer, rinfo: dgram.RemoteInfo) {
    // Find matching call by rinfo; externalMedia should send RTP from Asterisk to our port.
    // We keep the last seen peer per active call.
    // RTP header is 12 bytes.
    if (msg.length <= 12) return;
    const payload = msg.subarray(12);

    for (const [providerCallId, st] of this.callMap.entries()) {
      if (!st.extChannelId) continue;
      // Learn peer first packet.
      if (!st.rtpPeer) {
        st.rtpPeer = { address: rinfo.address, port: rinfo.port };
      }
      // Only accept from learned peer.
      if (st.rtpPeer.address !== rinfo.address || st.rtpPeer.port !== rinfo.port) continue;

      if (st.speaking) {
        return;
      }

      if (st.stt) {
        st.stt.sendAudio(payload);
      }
    }
  }

  private async setupConversation(params: { providerCallId: string; sipChannelId: string; isOutbound: boolean }) {
    const providerCallId = params.providerCallId;
    const st = this.callMap.get(providerCallId);
    if (!st) return;

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
      throw new Error("OPENAI_API_KEY missing");
    }
    const sttProvider = new OpenAIRealtimeSTTProvider({
      apiKey,
      model: (process.env.OPENAI_REALTIME_STT_MODEL || undefined) as string | undefined,
      silenceDurationMs: 800,
      vadThreshold: 0.5,
    });
    const session = sttProvider.createSession();
    await session.connect();
    session.onSpeechStart(() => {
      // barge-in: stop speaking
      const s = this.callMap.get(providerCallId);
      if (s) s.speaking = false;
    });
    session.onTranscript((t) => {
      const s = this.callMap.get(providerCallId);
      if (!s) return;
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

    // Speak greeting for inbound
    if (!params.isOutbound) {
      const greeting = "Czesc. Tu Eryk.";
      await this.playTts({ callId: st.callId, providerCallId, text: greeting } as any);
    }
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
    const endpoint = "PJSIP/" + this.cfg.trunk + "/" + input.to;
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

    // setup extMedia + stt session
    await this.setupConversation({ providerCallId, sipChannelId, isOutbound: true });

    return { providerCallId, status: "initiated" } as any;
  }

  async hangupCall(input: HangupCallInput): Promise<void> {
    const st = this.callMap.get(input.providerCallId);
    if (!st) return;
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
    if (!st) return;

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    // Generate PCM 24k
    const tts = new OpenAITTSProvider({ apiKey });
    const pcm24k = await tts.synthesize(input.text);
    // Convert to mulaw 8k
    const mulaw = convertPcmToMulaw8k(pcm24k, 24000);

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
      if (!st.speaking) break;

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
          if (err) reject(err);
          else resolve();
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
    if (!st) return;

    try {
      st.stt?.close();
    } catch {
      // ignore
    }

    // Best-effort destroy bridge/ext
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
