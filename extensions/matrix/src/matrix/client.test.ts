import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreConfig } from "../types.js";
import { resolveMatrixAuth, resolveMatrixConfig } from "./client.js";
import * as credentialsModule from "./credentials.js";
import * as sdkModule from "./sdk.js";

const saveMatrixCredentialsMock = vi.fn();
const prepareMatrixRegisterModeMock = vi.fn(async () => null);
const finalizeMatrixRegisterConfigAfterSuccessMock = vi.fn(async () => false);

vi.mock("./credentials.js", () => ({
  loadMatrixCredentials: vi.fn(() => null),
  saveMatrixCredentials: (...args: unknown[]) => saveMatrixCredentialsMock(...args),
  credentialsMatchConfig: vi.fn(() => false),
  touchMatrixCredentials: vi.fn(),
}));

vi.mock("./client/register-mode.js", () => ({
  prepareMatrixRegisterMode: (...args: unknown[]) => prepareMatrixRegisterModeMock(...args),
  finalizeMatrixRegisterConfigAfterSuccess: (...args: unknown[]) =>
    finalizeMatrixRegisterConfigAfterSuccessMock(...args),
  resetPreparedMatrixRegisterModesForTests: vi.fn(),
}));

describe("resolveMatrixConfig", () => {
  it("prefers config over env", () => {
    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://cfg.example.org",
          userId: "@cfg:example.org",
          accessToken: "cfg-token",
          password: "cfg-pass",
          deviceName: "CfgDevice",
          initialSyncLimit: 5,
        },
      },
    } as CoreConfig;
    const env = {
      MATRIX_HOMESERVER: "https://env.example.org",
      MATRIX_USER_ID: "@env:example.org",
      MATRIX_ACCESS_TOKEN: "env-token",
      MATRIX_PASSWORD: "env-pass",
      MATRIX_DEVICE_NAME: "EnvDevice",
    } as NodeJS.ProcessEnv;
    const resolved = resolveMatrixConfig(cfg, env);
    expect(resolved).toEqual({
      homeserver: "https://cfg.example.org",
      userId: "@cfg:example.org",
      accessToken: "cfg-token",
      password: "cfg-pass",
      register: false,
      deviceId: undefined,
      deviceName: "CfgDevice",
      initialSyncLimit: 5,
      encryption: false,
    });
  });

  it("uses env when config is missing", () => {
    const cfg = {} as CoreConfig;
    const env = {
      MATRIX_HOMESERVER: "https://env.example.org",
      MATRIX_USER_ID: "@env:example.org",
      MATRIX_ACCESS_TOKEN: "env-token",
      MATRIX_PASSWORD: "env-pass",
      MATRIX_DEVICE_ID: "ENVDEVICE",
      MATRIX_DEVICE_NAME: "EnvDevice",
    } as NodeJS.ProcessEnv;
    const resolved = resolveMatrixConfig(cfg, env);
    expect(resolved.homeserver).toBe("https://env.example.org");
    expect(resolved.userId).toBe("@env:example.org");
    expect(resolved.accessToken).toBe("env-token");
    expect(resolved.password).toBe("env-pass");
    expect(resolved.register).toBe(false);
    expect(resolved.deviceId).toBe("ENVDEVICE");
    expect(resolved.deviceName).toBe("EnvDevice");
    expect(resolved.initialSyncLimit).toBeUndefined();
    expect(resolved.encryption).toBe(false);
  });

  it("reads register flag from config and env", () => {
    const cfg = {
      channels: {
        matrix: {
          register: true,
        },
      },
    } as CoreConfig;
    const resolvedFromCfg = resolveMatrixConfig(cfg, {} as NodeJS.ProcessEnv);
    expect(resolvedFromCfg.register).toBe(true);

    const resolvedFromEnv = resolveMatrixConfig(
      {} as CoreConfig,
      {
        MATRIX_REGISTER: "1",
      } as NodeJS.ProcessEnv,
    );
    expect(resolvedFromEnv.register).toBe(true);
  });
});

describe("resolveMatrixAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    saveMatrixCredentialsMock.mockReset();
    prepareMatrixRegisterModeMock.mockReset();
    finalizeMatrixRegisterConfigAfterSuccessMock.mockReset();
  });

  it("uses the hardened client request path for password login and persists deviceId", async () => {
    const doRequestSpy = vi.spyOn(sdkModule.MatrixClient.prototype, "doRequest").mockResolvedValue({
      access_token: "tok-123",
      user_id: "@bot:example.org",
      device_id: "DEVICE123",
    });

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@bot:example.org",
          password: "secret",
          encryption: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({
      cfg,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(doRequestSpy).toHaveBeenCalledWith(
      "POST",
      "/_matrix/client/v3/login",
      undefined,
      expect.objectContaining({
        type: "m.login.password",
      }),
    );
    expect(auth).toMatchObject({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "tok-123",
      deviceId: "DEVICE123",
      encryption: true,
    });
    expect(saveMatrixCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homeserver: "https://matrix.example.org",
        userId: "@bot:example.org",
        accessToken: "tok-123",
        deviceId: "DEVICE123",
      }),
    );
  });

  it("can register account when password login fails and register mode is enabled", async () => {
    const doRequestSpy = vi.spyOn(sdkModule.MatrixClient.prototype, "doRequest");
    doRequestSpy
      .mockRejectedValueOnce(new Error("Invalid username or password"))
      .mockResolvedValueOnce({
        access_token: "tok-registered",
        user_id: "@newbot:example.org",
        device_id: "REGDEVICE123",
      });

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@newbot:example.org",
          password: "secret",
          register: true,
          encryption: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({
      cfg,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(doRequestSpy).toHaveBeenNthCalledWith(
      1,
      "POST",
      "/_matrix/client/v3/login",
      undefined,
      expect.objectContaining({
        type: "m.login.password",
        device_id: undefined,
      }),
    );
    expect(doRequestSpy).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/_matrix/client/v3/register",
      undefined,
      expect.objectContaining({
        username: "newbot",
        auth: { type: "m.login.dummy" },
      }),
    );
    expect(auth).toMatchObject({
      homeserver: "https://matrix.example.org",
      userId: "@newbot:example.org",
      accessToken: "tok-registered",
      deviceId: "REGDEVICE123",
      encryption: true,
    });
    expect(prepareMatrixRegisterModeMock).toHaveBeenCalledWith({
      cfg,
      homeserver: "https://matrix.example.org",
      userId: "@newbot:example.org",
      env: {} as NodeJS.ProcessEnv,
    });
    expect(finalizeMatrixRegisterConfigAfterSuccessMock).toHaveBeenCalledWith({
      homeserver: "https://matrix.example.org",
      userId: "@newbot:example.org",
      deviceId: "REGDEVICE123",
    });
  });

  it("ignores cached credentials when matrix.register=true", async () => {
    vi.mocked(credentialsModule.loadMatrixCredentials).mockReturnValue({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "cached-token",
      deviceId: "CACHEDDEVICE",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(credentialsModule.credentialsMatchConfig).mockReturnValue(true);

    const doRequestSpy = vi.spyOn(sdkModule.MatrixClient.prototype, "doRequest").mockResolvedValue({
      access_token: "tok-123",
      user_id: "@bot:example.org",
      device_id: "DEVICE123",
    });

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@bot:example.org",
          password: "secret",
          register: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({ cfg, env: {} as NodeJS.ProcessEnv });

    expect(doRequestSpy).toHaveBeenCalledWith(
      "POST",
      "/_matrix/client/v3/login",
      undefined,
      expect.objectContaining({
        type: "m.login.password",
      }),
    );
    expect(auth.accessToken).toBe("tok-123");
    expect(prepareMatrixRegisterModeMock).toHaveBeenCalledTimes(1);
  });

  it("requires matrix.password when matrix.register=true", async () => {
    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@bot:example.org",
          register: true,
        },
      },
    } as CoreConfig;

    await expect(resolveMatrixAuth({ cfg, env: {} as NodeJS.ProcessEnv })).rejects.toThrow(
      "Matrix password is required when matrix.register=true",
    );
    expect(prepareMatrixRegisterModeMock).not.toHaveBeenCalled();
    expect(finalizeMatrixRegisterConfigAfterSuccessMock).not.toHaveBeenCalled();
  });

  it("requires matrix.userId when matrix.register=true", async () => {
    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          password: "secret",
          register: true,
        },
      },
    } as CoreConfig;

    await expect(resolveMatrixAuth({ cfg, env: {} as NodeJS.ProcessEnv })).rejects.toThrow(
      "Matrix userId is required when matrix.register=true",
    );
    expect(prepareMatrixRegisterModeMock).not.toHaveBeenCalled();
    expect(finalizeMatrixRegisterConfigAfterSuccessMock).not.toHaveBeenCalled();
  });

  it("falls back to config deviceId when cached credentials are missing it", async () => {
    vi.mocked(credentialsModule.loadMatrixCredentials).mockReturnValue({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "tok-123",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(credentialsModule.credentialsMatchConfig).mockReturnValue(true);

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@bot:example.org",
          accessToken: "tok-123",
          deviceId: "DEVICE123",
          encryption: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({ cfg, env: {} as NodeJS.ProcessEnv });

    expect(auth.deviceId).toBe("DEVICE123");
    expect(saveMatrixCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homeserver: "https://matrix.example.org",
        userId: "@bot:example.org",
        accessToken: "tok-123",
        deviceId: "DEVICE123",
      }),
    );
  });

  it("resolves missing whoami identity fields for token auth", async () => {
    const doRequestSpy = vi.spyOn(sdkModule.MatrixClient.prototype, "doRequest").mockResolvedValue({
      user_id: "@bot:example.org",
      device_id: "DEVICE123",
    });

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          accessToken: "tok-123",
          encryption: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({
      cfg,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(doRequestSpy).toHaveBeenCalledWith("GET", "/_matrix/client/v3/account/whoami");
    expect(auth).toMatchObject({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "tok-123",
      deviceId: "DEVICE123",
      encryption: true,
    });
  });

  it("uses config deviceId with cached credentials when token is loaded from cache", async () => {
    vi.mocked(credentialsModule.loadMatrixCredentials).mockReturnValue({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "tok-123",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(credentialsModule.credentialsMatchConfig).mockReturnValue(true);

    const cfg = {
      channels: {
        matrix: {
          homeserver: "https://matrix.example.org",
          userId: "@bot:example.org",
          deviceId: "DEVICE123",
          encryption: true,
        },
      },
    } as CoreConfig;

    const auth = await resolveMatrixAuth({ cfg, env: {} as NodeJS.ProcessEnv });

    expect(auth).toMatchObject({
      homeserver: "https://matrix.example.org",
      userId: "@bot:example.org",
      accessToken: "tok-123",
      deviceId: "DEVICE123",
      encryption: true,
    });
  });
});
