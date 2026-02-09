import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixCryptoBootstrapApi, MatrixRawEvent } from "./types.js";
import { MatrixCryptoBootstrapper, type MatrixCryptoBootstrapperDeps } from "./crypto-bootstrap.js";

function createBootstrapperDeps() {
  return {
    getUserId: vi.fn(async () => "@bot:example.org"),
    getPassword: vi.fn(() => "super-secret-password"),
    getDeviceId: vi.fn(() => "DEVICE123"),
    verificationManager: {
      trackVerificationRequest: vi.fn(),
    },
    recoveryKeyStore: {
      bootstrapSecretStorageWithRecoveryKey: vi.fn(async () => {}),
    },
    decryptBridge: {
      bindCryptoRetrySignals: vi.fn(),
    },
  };
}

function createCryptoApi(overrides?: Partial<MatrixCryptoBootstrapApi>): MatrixCryptoBootstrapApi {
  return {
    on: vi.fn(),
    bootstrapCrossSigning: vi.fn(async () => {}),
    bootstrapSecretStorage: vi.fn(async () => {}),
    requestOwnUserVerification: vi.fn(async () => null),
    ...overrides,
  };
}

describe("MatrixCryptoBootstrapper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bootstraps cross-signing/secret-storage and binds decrypt retry signals", async () => {
    const deps = createBootstrapperDeps();
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith(
      expect.objectContaining({
        authUploadDeviceSigningKeys: expect.any(Function),
      }),
    );
    expect(deps.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey).toHaveBeenCalledWith(
      crypto,
    );
    expect(deps.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey).toHaveBeenCalledTimes(2);
    expect(deps.decryptBridge.bindCryptoRetrySignals).toHaveBeenCalledWith(crypto);
  });

  it("forces new cross-signing keys only when readiness check still fails", async () => {
    const deps = createBootstrapperDeps();
    const bootstrapCrossSigning = vi.fn(async () => {});
    const crypto = createCryptoApi({
      bootstrapCrossSigning,
      isCrossSigningReady: vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      userHasCrossSigningKeys: vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(bootstrapCrossSigning).toHaveBeenCalledTimes(2);
    expect(bootstrapCrossSigning).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        authUploadDeviceSigningKeys: expect.any(Function),
      }),
    );
    expect(bootstrapCrossSigning).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        setupNewCrossSigning: true,
        authUploadDeviceSigningKeys: expect.any(Function),
      }),
    );
  });

  it("uses password UIA fallback when null and dummy auth fail", async () => {
    const deps = createBootstrapperDeps();
    const bootstrapCrossSigning = vi.fn(async () => {});
    const crypto = createCryptoApi({
      bootstrapCrossSigning,
      isCrossSigningReady: vi.fn(async () => true),
      userHasCrossSigningKeys: vi.fn(async () => true),
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    const firstCall = bootstrapCrossSigning.mock.calls[0]?.[0] as {
      authUploadDeviceSigningKeys?: <T>(
        makeRequest: (authData: Record<string, unknown> | null) => Promise<T>,
      ) => Promise<T>;
    };
    expect(firstCall.authUploadDeviceSigningKeys).toBeTypeOf("function");

    const seenAuthStages: Array<Record<string, unknown> | null> = [];
    const result = await firstCall.authUploadDeviceSigningKeys?.(async (authData) => {
      seenAuthStages.push(authData);
      if (authData === null) {
        throw new Error("need auth");
      }
      if (authData.type === "m.login.dummy") {
        throw new Error("dummy rejected");
      }
      if (authData.type === "m.login.password") {
        return "ok";
      }
      throw new Error("unexpected auth stage");
    });

    expect(result).toBe("ok");
    expect(seenAuthStages).toEqual([
      null,
      { type: "m.login.dummy" },
      {
        type: "m.login.password",
        identifier: { type: "m.id.user", user: "@bot:example.org" },
        password: "super-secret-password",
      },
    ]);
  });

  it("resets cross-signing when first bootstrap attempt throws", async () => {
    const deps = createBootstrapperDeps();
    const bootstrapCrossSigning = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("first attempt failed"))
      .mockResolvedValueOnce(undefined);
    const crypto = createCryptoApi({
      bootstrapCrossSigning,
      isCrossSigningReady: vi.fn(async () => true),
      userHasCrossSigningKeys: vi.fn(async () => true),
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(bootstrapCrossSigning).toHaveBeenCalledTimes(2);
    expect(bootstrapCrossSigning).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        setupNewCrossSigning: true,
        authUploadDeviceSigningKeys: expect.any(Function),
      }),
    );
  });

  it("marks own device verified and cross-signs it when needed", async () => {
    const deps = createBootstrapperDeps();
    const setDeviceVerified = vi.fn(async () => {});
    const crossSignDevice = vi.fn(async () => {});
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => false,
        localVerified: false,
        crossSigningVerified: false,
        signedByOwner: false,
      })),
      setDeviceVerified,
      crossSignDevice,
      isCrossSigningReady: vi.fn(async () => true),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    expect(setDeviceVerified).toHaveBeenCalledWith("@bot:example.org", "DEVICE123", true);
    expect(crossSignDevice).toHaveBeenCalledWith("DEVICE123");
  });

  it("auto-accepts incoming verification requests from other users", async () => {
    const deps = createBootstrapperDeps();
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const crypto = createCryptoApi({
      getDeviceVerificationStatus: vi.fn(async () => ({
        isVerified: () => true,
      })),
      on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
        listeners.set(eventName, listener);
      }),
    });
    const bootstrapper = new MatrixCryptoBootstrapper(
      deps as unknown as MatrixCryptoBootstrapperDeps<MatrixRawEvent>,
    );

    await bootstrapper.bootstrap(crypto);

    const verificationRequest = {
      otherUserId: "@alice:example.org",
      isSelfVerification: false,
      initiatedByMe: false,
      accept: vi.fn(async () => {}),
    };
    const listener = Array.from(listeners.entries()).find(([eventName]) =>
      eventName.toLowerCase().includes("verificationrequest"),
    )?.[1];
    expect(listener).toBeTypeOf("function");
    await listener?.(verificationRequest);

    expect(deps.verificationManager.trackVerificationRequest).toHaveBeenCalledWith(
      verificationRequest,
    );
    expect(verificationRequest.accept).toHaveBeenCalledTimes(1);
  });
});
