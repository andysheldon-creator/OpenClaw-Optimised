export type DeviceAuthPayloadParams = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
};

function assertNoPipe(value: string, field: string): void {
  if (value.includes("|")) {
    throw new Error(`device auth payload field "${field}" must not contain pipe delimiter`);
  }
}

export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  // Validate fields do not contain the pipe delimiter to prevent payload injection.
  assertNoPipe(params.deviceId, "deviceId");
  assertNoPipe(params.clientId, "clientId");
  assertNoPipe(params.clientMode, "clientMode");
  assertNoPipe(params.role, "role");
  for (const scope of params.scopes) {
    assertNoPipe(scope, "scopes");
  }
  if (params.token) {
    assertNoPipe(params.token, "token");
  }
  if (params.nonce) {
    assertNoPipe(params.nonce, "nonce");
  }
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}
