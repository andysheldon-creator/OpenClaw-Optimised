import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreConfig } from "../../types.js";
import * as runtimeModule from "../../runtime.js";
import {
  finalizeMatrixRegisterConfigAfterSuccess,
  prepareMatrixRegisterMode,
  resetPreparedMatrixRegisterModesForTests,
} from "./register-mode.js";

describe("matrix register mode helpers", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    resetPreparedMatrixRegisterModesForTests();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("moves existing matrix state into a .bak snapshot before fresh registration", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-register-mode-"));
    tempDirs.push(stateDir);
    const credentialsDir = path.join(stateDir, "credentials", "matrix");
    const accountsDir = path.join(credentialsDir, "accounts");
    fs.mkdirSync(accountsDir, { recursive: true });
    fs.writeFileSync(path.join(credentialsDir, "credentials.json"), '{"accessToken":"old"}\n');
    fs.writeFileSync(path.join(accountsDir, "dummy.txt"), "old-state\n");

    const cfg = {
      channels: {
        matrix: {
          userId: "@pinguini:matrix.gumadeiras.com",
          register: true,
          encryption: true,
        },
      },
    } as CoreConfig;

    const backupDir = await prepareMatrixRegisterMode({
      cfg,
      homeserver: "https://matrix.gumadeiras.com",
      userId: "@pinguini:matrix.gumadeiras.com",
      env: { OPENCLAW_STATE_DIR: stateDir } as NodeJS.ProcessEnv,
    });

    expect(backupDir).toBeTruthy();
    expect(fs.existsSync(path.join(credentialsDir, "credentials.json"))).toBe(false);
    expect(fs.existsSync(path.join(credentialsDir, "accounts"))).toBe(false);
    expect(fs.existsSync(path.join(backupDir as string, "credentials.json"))).toBe(true);
    expect(fs.existsSync(path.join(backupDir as string, "accounts", "dummy.txt"))).toBe(true);
    expect(fs.existsSync(path.join(backupDir as string, "matrix-config.json"))).toBe(true);
  });

  it("updates matrix config after successful register mode auth", async () => {
    const writeConfigFile = vi.fn(async () => {});
    vi.spyOn(runtimeModule, "getMatrixRuntime").mockReturnValue({
      config: {
        loadConfig: () =>
          ({
            channels: {
              matrix: {
                register: true,
                accessToken: "stale-token",
                userId: "@pinguini:matrix.gumadeiras.com",
              },
            },
          }) as CoreConfig,
        writeConfigFile,
      },
    } as never);

    const updated = await finalizeMatrixRegisterConfigAfterSuccess({
      homeserver: "https://matrix.gumadeiras.com",
      userId: "@pinguini:matrix.gumadeiras.com",
      deviceId: "DEVICE123",
    });
    expect(updated).toBe(true);
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.objectContaining({
          matrix: expect.objectContaining({
            register: false,
            homeserver: "https://matrix.gumadeiras.com",
            userId: "@pinguini:matrix.gumadeiras.com",
            deviceId: "DEVICE123",
          }),
        }),
      }),
    );
    const written = writeConfigFile.mock.calls[0]?.[0] as CoreConfig;
    expect(written.channels?.matrix?.accessToken).toBeUndefined();
  });
});
