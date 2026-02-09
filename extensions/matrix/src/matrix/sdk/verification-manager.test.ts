import { VerificationPhase } from "matrix-js-sdk/lib/crypto-api/verification.js";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  MatrixVerificationManager,
  type MatrixShowQrCodeCallbacks,
  type MatrixShowSasCallbacks,
  type MatrixVerificationRequestLike,
  type MatrixVerifierLike,
} from "./verification-manager.js";

class MockVerifier extends EventEmitter implements MatrixVerifierLike {
  constructor(
    private readonly sasCallbacks: MatrixShowSasCallbacks | null,
    private readonly qrCallbacks: MatrixShowQrCodeCallbacks | null,
    private readonly verifyImpl: () => Promise<void> = async () => {},
  ) {
    super();
  }

  verify(): Promise<void> {
    return this.verifyImpl();
  }

  cancel(_e: Error): void {
    void _e;
  }

  getShowSasCallbacks(): MatrixShowSasCallbacks | null {
    return this.sasCallbacks;
  }

  getReciprocateQrCodeCallbacks(): MatrixShowQrCodeCallbacks | null {
    return this.qrCallbacks;
  }
}

class MockVerificationRequest extends EventEmitter implements MatrixVerificationRequestLike {
  transactionId?: string;
  roomId?: string;
  initiatedByMe = false;
  otherUserId = "@alice:example.org";
  otherDeviceId?: string;
  isSelfVerification = false;
  phase = VerificationPhase.Requested;
  pending = true;
  accepting = false;
  declining = false;
  methods: string[] = ["m.sas.v1"];
  chosenMethod?: string | null;
  cancellationCode?: string | null;
  verifier?: MatrixVerifierLike;

  constructor(init?: Partial<MockVerificationRequest>) {
    super();
    Object.assign(this, init);
  }

  accept = vi.fn(async () => {
    this.phase = VerificationPhase.Ready;
  });

  cancel = vi.fn(async () => {
    this.phase = VerificationPhase.Cancelled;
  });

  startVerification = vi.fn(async (_method: string) => {
    if (!this.verifier) {
      throw new Error("verifier not configured");
    }
    this.phase = VerificationPhase.Started;
    return this.verifier;
  });

  scanQRCode = vi.fn(async (_qrCodeData: Uint8ClampedArray) => {
    if (!this.verifier) {
      throw new Error("verifier not configured");
    }
    this.phase = VerificationPhase.Started;
    return this.verifier;
  });

  generateQRCode = vi.fn(async () => new Uint8ClampedArray([1, 2, 3]));
}

describe("MatrixVerificationManager", () => {
  it("reuses the same tracked id for repeated transaction IDs", () => {
    const manager = new MatrixVerificationManager();
    const first = new MockVerificationRequest({
      transactionId: "txn-1",
      phase: VerificationPhase.Requested,
    });
    const second = new MockVerificationRequest({
      transactionId: "txn-1",
      phase: VerificationPhase.Ready,
      pending: false,
      chosenMethod: "m.sas.v1",
    });

    const firstSummary = manager.trackVerificationRequest(first);
    const secondSummary = manager.trackVerificationRequest(second);

    expect(secondSummary.id).toBe(firstSummary.id);
    expect(secondSummary.phase).toBe(VerificationPhase.Ready);
    expect(secondSummary.pending).toBe(false);
    expect(secondSummary.chosenMethod).toBe("m.sas.v1");
  });

  it("starts SAS verification and exposes SAS payload/callback flow", async () => {
    const confirm = vi.fn(async () => {});
    const mismatch = vi.fn();
    const verifier = new MockVerifier(
      {
        sas: {
          decimal: [111, 222, 333],
          emoji: [
            ["cat", "cat"],
            ["dog", "dog"],
            ["fox", "fox"],
          ],
        },
        confirm,
        mismatch,
        cancel: vi.fn(),
      },
      null,
      async () => {},
    );
    const request = new MockVerificationRequest({
      transactionId: "txn-2",
      verifier,
    });
    const manager = new MatrixVerificationManager();
    const tracked = manager.trackVerificationRequest(request);

    const started = await manager.startVerification(tracked.id, "sas");
    expect(started.hasSas).toBe(true);

    const sas = manager.getVerificationSas(tracked.id);
    expect(sas.decimal).toEqual([111, 222, 333]);
    expect(sas.emoji?.length).toBe(3);

    await manager.confirmVerificationSas(tracked.id);
    expect(confirm).toHaveBeenCalledTimes(1);

    manager.mismatchVerificationSas(tracked.id);
    expect(mismatch).toHaveBeenCalledTimes(1);
  });

  it("prunes stale terminal sessions during list operations", () => {
    const now = new Date("2026-02-08T15:00:00.000Z").getTime();
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(now);

    const manager = new MatrixVerificationManager();
    manager.trackVerificationRequest(
      new MockVerificationRequest({
        transactionId: "txn-old-done",
        phase: VerificationPhase.Done,
        pending: false,
      }),
    );

    nowSpy.mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
    const summaries = manager.listVerifications();

    expect(summaries).toHaveLength(0);
    nowSpy.mockRestore();
  });
});
