import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/CryptoEvent.js";
import type { MatrixDecryptBridge } from "./decrypt-bridge.js";
import type { MatrixRecoveryKeyStore } from "./recovery-key-store.js";
import type {
  MatrixAuthDict,
  MatrixCryptoBootstrapApi,
  MatrixRawEvent,
  MatrixUiAuthCallback,
} from "./types.js";
import type {
  MatrixVerificationManager,
  MatrixVerificationRequestLike,
} from "./verification-manager.js";
import { LogService } from "./logger.js";

export type MatrixCryptoBootstrapperDeps<TRawEvent extends MatrixRawEvent> = {
  getUserId: () => Promise<string>;
  getPassword?: () => string | undefined;
  getDeviceId: () => string | null | undefined;
  verificationManager: MatrixVerificationManager;
  recoveryKeyStore: MatrixRecoveryKeyStore;
  decryptBridge: Pick<MatrixDecryptBridge<TRawEvent>, "bindCryptoRetrySignals">;
};

export class MatrixCryptoBootstrapper<TRawEvent extends MatrixRawEvent> {
  constructor(private readonly deps: MatrixCryptoBootstrapperDeps<TRawEvent>) {}

  async bootstrap(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    await this.bootstrapSecretStorage(crypto);
    await this.bootstrapCrossSigning(crypto);
    await this.bootstrapSecretStorage(crypto);
    await this.ensureOwnDeviceTrust(crypto);
    this.registerVerificationRequestHandler(crypto);
  }

  private createSigningKeysUiAuthCallback(params: {
    userId: string;
    password?: string;
  }): MatrixUiAuthCallback {
    return async <T>(makeRequest: (authData: MatrixAuthDict | null) => Promise<T>): Promise<T> => {
      try {
        return await makeRequest(null);
      } catch {
        // Some homeservers require an explicit dummy UIA stage even when no user interaction is needed.
        try {
          return await makeRequest({ type: "m.login.dummy" });
        } catch {
          if (!params.password?.trim()) {
            throw new Error(
              "Matrix cross-signing key upload requires UIA; provide matrix.password for m.login.password fallback",
            );
          }
          return await makeRequest({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: params.userId },
            password: params.password,
          });
        }
      }
    };
  }

  private async bootstrapCrossSigning(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    const userId = await this.deps.getUserId();
    const authUploadDeviceSigningKeys = this.createSigningKeysUiAuthCallback({
      userId,
      password: this.deps.getPassword?.(),
    });
    const hasPublishedCrossSigningKeys = async (): Promise<boolean> => {
      if (typeof crypto.userHasCrossSigningKeys !== "function") {
        return true;
      }
      try {
        return await crypto.userHasCrossSigningKeys(userId, true);
      } catch {
        return false;
      }
    };
    const isCrossSigningReady = async (): Promise<boolean> => {
      if (typeof crypto.isCrossSigningReady !== "function") {
        return true;
      }
      try {
        return await crypto.isCrossSigningReady();
      } catch {
        return false;
      }
    };

    // First pass: preserve existing cross-signing identity and ensure public keys are uploaded.
    try {
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys,
      });
    } catch (err) {
      LogService.warn(
        "MatrixClientLite",
        "Initial cross-signing bootstrap failed, trying reset:",
        err,
      );
      try {
        await crypto.bootstrapCrossSigning({
          setupNewCrossSigning: true,
          authUploadDeviceSigningKeys,
        });
      } catch (resetErr) {
        LogService.warn("MatrixClientLite", "Failed to bootstrap cross-signing:", resetErr);
        return;
      }
    }

    const firstPassReady = await isCrossSigningReady();
    const firstPassPublished = await hasPublishedCrossSigningKeys();
    if (firstPassReady && firstPassPublished) {
      LogService.info("MatrixClientLite", "Cross-signing bootstrap complete");
      return;
    }

    // Fallback: recover from broken local/server state by creating a fresh identity.
    try {
      await crypto.bootstrapCrossSigning({
        setupNewCrossSigning: true,
        authUploadDeviceSigningKeys,
      });
    } catch (err) {
      LogService.warn("MatrixClientLite", "Fallback cross-signing bootstrap failed:", err);
      return;
    }

    const finalReady = await isCrossSigningReady();
    const finalPublished = await hasPublishedCrossSigningKeys();
    if (finalReady && finalPublished) {
      LogService.info("MatrixClientLite", "Cross-signing bootstrap complete");
      return;
    }
    LogService.warn(
      "MatrixClientLite",
      "Cross-signing bootstrap finished but server keys are still not published",
    );
  }

  private async bootstrapSecretStorage(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    try {
      await this.deps.recoveryKeyStore.bootstrapSecretStorageWithRecoveryKey(crypto);
      LogService.info("MatrixClientLite", "Secret storage bootstrap complete");
    } catch (err) {
      LogService.warn("MatrixClientLite", "Failed to bootstrap secret storage:", err);
    }
  }

  private registerVerificationRequestHandler(crypto: MatrixCryptoBootstrapApi): void {
    // Auto-accept incoming verification requests from other users/devices.
    crypto.on(CryptoEvent.VerificationRequestReceived, async (request) => {
      const verificationRequest = request as MatrixVerificationRequestLike;
      this.deps.verificationManager.trackVerificationRequest(verificationRequest);
      const otherUserId = verificationRequest.otherUserId;
      const isSelfVerification = verificationRequest.isSelfVerification;
      const initiatedByMe = verificationRequest.initiatedByMe;

      if (isSelfVerification || initiatedByMe) {
        LogService.debug(
          "MatrixClientLite",
          `Ignoring ${isSelfVerification ? "self" : "initiated"} verification request from ${otherUserId}`,
        );
        return;
      }

      try {
        LogService.info(
          "MatrixClientLite",
          `Auto-accepting verification request from ${otherUserId}`,
        );
        await verificationRequest.accept();
        LogService.info(
          "MatrixClientLite",
          `Verification request from ${otherUserId} accepted, waiting for SAS...`,
        );
      } catch (err) {
        LogService.warn(
          "MatrixClientLite",
          `Failed to auto-accept verification from ${otherUserId}:`,
          err,
        );
      }
    });

    this.deps.decryptBridge.bindCryptoRetrySignals(crypto);
    LogService.info("MatrixClientLite", "Verification request handler registered");
  }

  private async ensureOwnDeviceTrust(crypto: MatrixCryptoBootstrapApi): Promise<void> {
    const deviceId = this.deps.getDeviceId()?.trim();
    if (!deviceId) {
      return;
    }
    const userId = await this.deps.getUserId();

    const deviceStatus =
      typeof crypto.getDeviceVerificationStatus === "function"
        ? await crypto.getDeviceVerificationStatus(userId, deviceId).catch(() => null)
        : null;
    const alreadyVerified =
      deviceStatus?.isVerified?.() === true ||
      deviceStatus?.localVerified === true ||
      deviceStatus?.crossSigningVerified === true ||
      deviceStatus?.signedByOwner === true;

    if (alreadyVerified) {
      return;
    }

    if (typeof crypto.setDeviceVerified === "function") {
      await crypto.setDeviceVerified(userId, deviceId, true);
    }

    if (typeof crypto.crossSignDevice === "function") {
      const crossSigningReady =
        typeof crypto.isCrossSigningReady === "function"
          ? await crypto.isCrossSigningReady()
          : true;
      if (crossSigningReady) {
        await crypto.crossSignDevice(deviceId);
      }
    }
  }
}
