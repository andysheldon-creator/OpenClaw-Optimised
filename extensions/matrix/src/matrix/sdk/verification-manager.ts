import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
} from "matrix-js-sdk/lib/crypto-api/verification.js";
import { VerificationMethod } from "matrix-js-sdk/lib/types.js";

export type MatrixVerificationMethod = "sas" | "show-qr" | "scan-qr";

export type MatrixVerificationSummary = {
  id: string;
  transactionId?: string;
  roomId?: string;
  otherUserId: string;
  otherDeviceId?: string;
  isSelfVerification: boolean;
  initiatedByMe: boolean;
  phase: number;
  phaseName: string;
  pending: boolean;
  methods: string[];
  chosenMethod?: string | null;
  canAccept: boolean;
  hasSas: boolean;
  hasReciprocateQr: boolean;
  completed: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type MatrixShowSasCallbacks = {
  sas: {
    decimal?: [number, number, number];
    emoji?: Array<[string, string]>;
  };
  confirm: () => Promise<void>;
  mismatch: () => void;
  cancel: () => void;
};

export type MatrixShowQrCodeCallbacks = {
  confirm: () => void;
  cancel: () => void;
};

export type MatrixVerifierLike = {
  verify: () => Promise<void>;
  cancel: (e: Error) => void;
  getShowSasCallbacks: () => MatrixShowSasCallbacks | null;
  getReciprocateQrCodeCallbacks: () => MatrixShowQrCodeCallbacks | null;
  on: (eventName: string, listener: (...args: unknown[]) => void) => void;
};

export type MatrixVerificationRequestLike = {
  transactionId?: string;
  roomId?: string;
  initiatedByMe: boolean;
  otherUserId: string;
  otherDeviceId?: string;
  isSelfVerification: boolean;
  phase: number;
  pending: boolean;
  accepting: boolean;
  declining: boolean;
  methods: string[];
  chosenMethod?: string | null;
  cancellationCode?: string | null;
  accept: () => Promise<void>;
  cancel: (params?: { reason?: string; code?: string }) => Promise<void>;
  startVerification: (method: string) => Promise<MatrixVerifierLike>;
  scanQRCode: (qrCodeData: Uint8ClampedArray) => Promise<MatrixVerifierLike>;
  generateQRCode: () => Promise<Uint8ClampedArray | undefined>;
  verifier?: MatrixVerifierLike;
  on: (eventName: string, listener: (...args: unknown[]) => void) => void;
};

export type MatrixVerificationCryptoApi = {
  requestOwnUserVerification: () => Promise<unknown | null>;
  requestDeviceVerification?: (
    userId: string,
    deviceId: string,
  ) => Promise<MatrixVerificationRequestLike>;
  requestVerificationDM?: (
    userId: string,
    roomId: string,
  ) => Promise<MatrixVerificationRequestLike>;
};

type MatrixVerificationSession = {
  id: string;
  request: MatrixVerificationRequestLike;
  createdAtMs: number;
  updatedAtMs: number;
  error?: string;
  activeVerifier?: MatrixVerifierLike;
  verifyPromise?: Promise<void>;
  verifyStarted: boolean;
  sasCallbacks?: MatrixShowSasCallbacks;
  reciprocateQrCallbacks?: MatrixShowQrCodeCallbacks;
};

const MAX_TRACKED_VERIFICATION_SESSIONS = 256;
const TERMINAL_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

export class MatrixVerificationManager {
  private readonly verificationSessions = new Map<string, MatrixVerificationSession>();
  private verificationSessionCounter = 0;
  private readonly trackedVerificationRequests = new WeakSet<object>();
  private readonly trackedVerificationVerifiers = new WeakSet<object>();

  private pruneVerificationSessions(nowMs: number): void {
    for (const [id, session] of this.verificationSessions) {
      const phase = session.request.phase;
      const isTerminal = phase === VerificationPhase.Done || phase === VerificationPhase.Cancelled;
      if (isTerminal && nowMs - session.updatedAtMs > TERMINAL_SESSION_RETENTION_MS) {
        this.verificationSessions.delete(id);
      }
    }

    if (this.verificationSessions.size <= MAX_TRACKED_VERIFICATION_SESSIONS) {
      return;
    }

    const sortedByAge = Array.from(this.verificationSessions.entries()).sort(
      (a, b) => a[1].updatedAtMs - b[1].updatedAtMs,
    );
    const overflow = this.verificationSessions.size - MAX_TRACKED_VERIFICATION_SESSIONS;
    for (let i = 0; i < overflow; i += 1) {
      const entry = sortedByAge[i];
      if (entry) {
        this.verificationSessions.delete(entry[0]);
      }
    }
  }

  private getVerificationPhaseName(phase: number): string {
    switch (phase) {
      case VerificationPhase.Unsent:
        return "unsent";
      case VerificationPhase.Requested:
        return "requested";
      case VerificationPhase.Ready:
        return "ready";
      case VerificationPhase.Started:
        return "started";
      case VerificationPhase.Cancelled:
        return "cancelled";
      case VerificationPhase.Done:
        return "done";
      default:
        return `unknown(${phase})`;
    }
  }

  private touchVerificationSession(session: MatrixVerificationSession): void {
    session.updatedAtMs = Date.now();
  }

  private buildVerificationSummary(session: MatrixVerificationSession): MatrixVerificationSummary {
    const request = session.request;
    const phase = request.phase;
    const canAccept = phase < VerificationPhase.Ready && !request.accepting && !request.declining;
    return {
      id: session.id,
      transactionId: request.transactionId,
      roomId: request.roomId,
      otherUserId: request.otherUserId,
      otherDeviceId: request.otherDeviceId,
      isSelfVerification: request.isSelfVerification,
      initiatedByMe: request.initiatedByMe,
      phase,
      phaseName: this.getVerificationPhaseName(phase),
      pending: request.pending,
      methods: Array.isArray(request.methods) ? request.methods : [],
      chosenMethod: request.chosenMethod ?? null,
      canAccept,
      hasSas: Boolean(session.sasCallbacks),
      hasReciprocateQr: Boolean(session.reciprocateQrCallbacks),
      completed: phase === VerificationPhase.Done,
      error: session.error,
      createdAt: new Date(session.createdAtMs).toISOString(),
      updatedAt: new Date(session.updatedAtMs).toISOString(),
    };
  }

  private findVerificationSession(id: string): MatrixVerificationSession {
    const direct = this.verificationSessions.get(id);
    if (direct) {
      return direct;
    }
    for (const session of this.verificationSessions.values()) {
      if (session.request.transactionId === id) {
        return session;
      }
    }
    throw new Error(`Matrix verification request not found: ${id}`);
  }

  private ensureVerificationRequestTracked(session: MatrixVerificationSession): void {
    const requestObj = session.request as unknown as object;
    if (this.trackedVerificationRequests.has(requestObj)) {
      return;
    }
    this.trackedVerificationRequests.add(requestObj);
    session.request.on(VerificationRequestEvent.Change, () => {
      this.touchVerificationSession(session);
      if (session.request.verifier) {
        this.attachVerifierToVerificationSession(session, session.request.verifier);
      }
    });
  }

  private attachVerifierToVerificationSession(
    session: MatrixVerificationSession,
    verifier: MatrixVerifierLike,
  ): void {
    session.activeVerifier = verifier;
    this.touchVerificationSession(session);

    const maybeSas = verifier.getShowSasCallbacks();
    if (maybeSas) {
      session.sasCallbacks = maybeSas;
    }
    const maybeReciprocateQr = verifier.getReciprocateQrCodeCallbacks();
    if (maybeReciprocateQr) {
      session.reciprocateQrCallbacks = maybeReciprocateQr;
    }

    const verifierObj = verifier as unknown as object;
    if (this.trackedVerificationVerifiers.has(verifierObj)) {
      return;
    }
    this.trackedVerificationVerifiers.add(verifierObj);

    verifier.on(VerifierEvent.ShowSas, (sas) => {
      session.sasCallbacks = sas as MatrixShowSasCallbacks;
      this.touchVerificationSession(session);
    });
    verifier.on(VerifierEvent.ShowReciprocateQr, (qr) => {
      session.reciprocateQrCallbacks = qr as MatrixShowQrCodeCallbacks;
      this.touchVerificationSession(session);
    });
    verifier.on(VerifierEvent.Cancel, (err) => {
      session.error = err instanceof Error ? err.message : String(err);
      this.touchVerificationSession(session);
    });
  }

  private ensureVerificationStarted(session: MatrixVerificationSession): void {
    if (!session.activeVerifier || session.verifyStarted) {
      return;
    }
    session.verifyStarted = true;
    const verifier = session.activeVerifier;
    session.verifyPromise = verifier
      .verify()
      .then(() => {
        this.touchVerificationSession(session);
      })
      .catch((err) => {
        session.error = err instanceof Error ? err.message : String(err);
        this.touchVerificationSession(session);
      });
  }

  trackVerificationRequest(request: MatrixVerificationRequestLike): MatrixVerificationSummary {
    this.pruneVerificationSessions(Date.now());
    const txId = request.transactionId?.trim();
    if (txId) {
      for (const existing of this.verificationSessions.values()) {
        if (existing.request.transactionId === txId) {
          existing.request = request;
          this.ensureVerificationRequestTracked(existing);
          if (request.verifier) {
            this.attachVerifierToVerificationSession(existing, request.verifier);
          }
          this.touchVerificationSession(existing);
          return this.buildVerificationSummary(existing);
        }
      }
    }

    const now = Date.now();
    const id = `verification-${++this.verificationSessionCounter}`;
    const session: MatrixVerificationSession = {
      id,
      request,
      createdAtMs: now,
      updatedAtMs: now,
      verifyStarted: false,
    };
    this.verificationSessions.set(session.id, session);
    this.ensureVerificationRequestTracked(session);
    if (request.verifier) {
      this.attachVerifierToVerificationSession(session, request.verifier);
    }
    return this.buildVerificationSummary(session);
  }

  async requestOwnUserVerification(
    crypto: MatrixVerificationCryptoApi | undefined,
  ): Promise<MatrixVerificationSummary | null> {
    if (!crypto) {
      return null;
    }
    const request =
      (await crypto.requestOwnUserVerification()) as MatrixVerificationRequestLike | null;
    if (!request) {
      return null;
    }
    return this.trackVerificationRequest(request);
  }

  listVerifications(): MatrixVerificationSummary[] {
    this.pruneVerificationSessions(Date.now());
    const summaries = Array.from(this.verificationSessions.values()).map((session) =>
      this.buildVerificationSummary(session),
    );
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async requestVerification(
    crypto: MatrixVerificationCryptoApi | undefined,
    params: {
      ownUser?: boolean;
      userId?: string;
      deviceId?: string;
      roomId?: string;
    },
  ): Promise<MatrixVerificationSummary> {
    if (!crypto) {
      throw new Error("Matrix crypto is not available");
    }
    let request: MatrixVerificationRequestLike | null = null;
    if (params.ownUser) {
      request = (await crypto.requestOwnUserVerification()) as MatrixVerificationRequestLike | null;
    } else if (params.userId && params.deviceId && crypto.requestDeviceVerification) {
      request = await crypto.requestDeviceVerification(params.userId, params.deviceId);
    } else if (params.userId && params.roomId && crypto.requestVerificationDM) {
      request = await crypto.requestVerificationDM(params.userId, params.roomId);
    } else {
      throw new Error(
        "Matrix verification request requires one of: ownUser, userId+deviceId, or userId+roomId",
      );
    }

    if (!request) {
      throw new Error("Matrix verification request could not be created");
    }
    return this.trackVerificationRequest(request);
  }

  async acceptVerification(id: string): Promise<MatrixVerificationSummary> {
    const session = this.findVerificationSession(id);
    await session.request.accept();
    this.touchVerificationSession(session);
    return this.buildVerificationSummary(session);
  }

  async cancelVerification(
    id: string,
    params?: { reason?: string; code?: string },
  ): Promise<MatrixVerificationSummary> {
    const session = this.findVerificationSession(id);
    await session.request.cancel(params);
    this.touchVerificationSession(session);
    return this.buildVerificationSummary(session);
  }

  async startVerification(
    id: string,
    method: MatrixVerificationMethod = "sas",
  ): Promise<MatrixVerificationSummary> {
    const session = this.findVerificationSession(id);
    if (method !== "sas") {
      throw new Error("Matrix startVerification currently supports only SAS directly");
    }
    const verifier = await session.request.startVerification(VerificationMethod.Sas);
    this.attachVerifierToVerificationSession(session, verifier);
    this.ensureVerificationStarted(session);
    return this.buildVerificationSummary(session);
  }

  async generateVerificationQr(id: string): Promise<{ qrDataBase64: string }> {
    const session = this.findVerificationSession(id);
    const qr = await session.request.generateQRCode();
    if (!qr) {
      throw new Error("Matrix verification QR data is not available yet");
    }
    return { qrDataBase64: Buffer.from(qr).toString("base64") };
  }

  async scanVerificationQr(id: string, qrDataBase64: string): Promise<MatrixVerificationSummary> {
    const session = this.findVerificationSession(id);
    const trimmed = qrDataBase64.trim();
    if (!trimmed) {
      throw new Error("Matrix verification QR payload is required");
    }
    const qrBytes = Buffer.from(trimmed, "base64");
    if (qrBytes.length === 0) {
      throw new Error("Matrix verification QR payload is invalid base64");
    }
    const verifier = await session.request.scanQRCode(new Uint8ClampedArray(qrBytes));
    this.attachVerifierToVerificationSession(session, verifier);
    this.ensureVerificationStarted(session);
    return this.buildVerificationSummary(session);
  }

  async confirmVerificationSas(id: string): Promise<MatrixVerificationSummary> {
    const session = this.findVerificationSession(id);
    const callbacks = session.sasCallbacks ?? session.activeVerifier?.getShowSasCallbacks();
    if (!callbacks) {
      throw new Error("Matrix SAS confirmation is not available for this verification request");
    }
    session.sasCallbacks = callbacks;
    await callbacks.confirm();
    this.touchVerificationSession(session);
    return this.buildVerificationSummary(session);
  }

  mismatchVerificationSas(id: string): MatrixVerificationSummary {
    const session = this.findVerificationSession(id);
    const callbacks = session.sasCallbacks ?? session.activeVerifier?.getShowSasCallbacks();
    if (!callbacks) {
      throw new Error("Matrix SAS mismatch is not available for this verification request");
    }
    session.sasCallbacks = callbacks;
    callbacks.mismatch();
    this.touchVerificationSession(session);
    return this.buildVerificationSummary(session);
  }

  confirmVerificationReciprocateQr(id: string): MatrixVerificationSummary {
    const session = this.findVerificationSession(id);
    const callbacks =
      session.reciprocateQrCallbacks ?? session.activeVerifier?.getReciprocateQrCodeCallbacks();
    if (!callbacks) {
      throw new Error(
        "Matrix reciprocate-QR confirmation is not available for this verification request",
      );
    }
    session.reciprocateQrCallbacks = callbacks;
    callbacks.confirm();
    this.touchVerificationSession(session);
    return this.buildVerificationSummary(session);
  }

  getVerificationSas(id: string): {
    decimal?: [number, number, number];
    emoji?: Array<[string, string]>;
  } {
    const session = this.findVerificationSession(id);
    const callbacks = session.sasCallbacks ?? session.activeVerifier?.getShowSasCallbacks();
    if (!callbacks) {
      throw new Error("Matrix SAS data is not available for this verification request");
    }
    session.sasCallbacks = callbacks;
    return {
      decimal: callbacks.sas.decimal,
      emoji: callbacks.sas.emoji,
    };
  }
}
