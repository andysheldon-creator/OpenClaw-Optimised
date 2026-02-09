import type { MatrixActionClientOpts } from "./types.js";
import { resolveActionClient } from "./client.js";

function requireCrypto(
  client: import("../sdk.js").MatrixClient,
): NonNullable<import("../sdk.js").MatrixClient["crypto"]> {
  if (!client.crypto) {
    throw new Error("Matrix encryption is not available (enable channels.matrix.encryption=true)");
  }
  return client.crypto;
}

function resolveVerificationId(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error("Matrix verification request id is required");
  }
  return normalized;
}

export async function listMatrixVerifications(opts: MatrixActionClientOpts = {}) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.listVerifications();
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function requestMatrixVerification(
  params: MatrixActionClientOpts & {
    ownUser?: boolean;
    userId?: string;
    deviceId?: string;
    roomId?: string;
  } = {},
) {
  const { client, stopOnDone } = await resolveActionClient(params);
  try {
    const crypto = requireCrypto(client);
    const ownUser = params.ownUser ?? (!params.userId && !params.deviceId && !params.roomId);
    return await crypto.requestVerification({
      ownUser,
      userId: params.userId?.trim() || undefined,
      deviceId: params.deviceId?.trim() || undefined,
      roomId: params.roomId?.trim() || undefined,
    });
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function acceptMatrixVerification(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.acceptVerification(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function cancelMatrixVerification(
  requestId: string,
  opts: MatrixActionClientOpts & { reason?: string; code?: string } = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.cancelVerification(resolveVerificationId(requestId), {
      reason: opts.reason?.trim() || undefined,
      code: opts.code?.trim() || undefined,
    });
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function startMatrixVerification(
  requestId: string,
  opts: MatrixActionClientOpts & { method?: "sas" } = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.startVerification(resolveVerificationId(requestId), opts.method ?? "sas");
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function generateMatrixVerificationQr(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.generateVerificationQr(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function scanMatrixVerificationQr(
  requestId: string,
  qrDataBase64: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    const payload = qrDataBase64.trim();
    if (!payload) {
      throw new Error("Matrix QR data is required");
    }
    return await crypto.scanVerificationQr(resolveVerificationId(requestId), payload);
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function getMatrixVerificationSas(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.getVerificationSas(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function confirmMatrixVerificationSas(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.confirmVerificationSas(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function mismatchMatrixVerificationSas(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.mismatchVerificationSas(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function confirmMatrixVerificationReciprocateQr(
  requestId: string,
  opts: MatrixActionClientOpts = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    return await crypto.confirmVerificationReciprocateQr(resolveVerificationId(requestId));
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}

export async function getMatrixEncryptionStatus(
  opts: MatrixActionClientOpts & { includeRecoveryKey?: boolean } = {},
) {
  const { client, stopOnDone } = await resolveActionClient(opts);
  try {
    const crypto = requireCrypto(client);
    const recoveryKey = await crypto.getRecoveryKey();
    return {
      encryptionEnabled: true,
      recoveryKeyStored: Boolean(recoveryKey),
      recoveryKeyCreatedAt: recoveryKey?.createdAt ?? null,
      ...(opts.includeRecoveryKey ? { recoveryKey: recoveryKey?.encodedPrivateKey ?? null } : {}),
      pendingVerifications: (await crypto.listVerifications()).length,
    };
  } finally {
    if (stopOnDone) {
      client.stop();
    }
  }
}
