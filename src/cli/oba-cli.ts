import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";

import { openUrl } from "../commands/onboard-helpers.js";
import { defaultRuntime } from "../runtime.js";
import { loginOba, saveObaToken } from "../security/oba/login.js";
import { getObaKeysDir } from "../security/oba/keys.js";
import {
  generateObaKeyPair,
  listObaKeys,
  loadMostRecentObaKey,
  loadObaKey,
  publicKeyToJwkX,
  saveObaKey,
  type ObaKeyFile,
} from "../security/oba/keys.js";
import { validateOwnerUrl } from "../security/oba/owner-url.js";
import { registerAgent } from "../security/oba/register.js";
import {
  parseSkillMetadataObject,
  signPluginManifest,
  signSkillMetadata,
} from "../security/oba/sign.js";
import { verifyObaContainer } from "../security/oba/verify.js";
import { formatDocsLink } from "../terminal/links.js";
import { isRich, theme } from "../terminal/theme.js";

function resolveKey(kid?: string): ObaKeyFile {
  if (kid) {
    return loadObaKey(kid);
  }
  const key = loadMostRecentObaKey();
  if (!key) {
    throw new Error("No OBA keys found. Run: openclaw oba keygen");
  }
  return key;
}

function resolveToken(tokenOpt?: string): string {
  if (tokenOpt) {
    return tokenOpt;
  }
  const envToken = process.env.OPENBOTAUTH_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  // Fallback: read from ~/.openclaw/oba/token (respects OPENCLAW_STATE_DIR).
  try {
    const tokenFile = path.join(path.dirname(getObaKeysDir()), "token");
    if (fs.existsSync(tokenFile)) {
      return fs.readFileSync(tokenFile, "utf-8").trim();
    }
  } catch {
    // ignore
  }
  throw new Error(
    "No API token. Run `openclaw oba login`, provide --token, or set OPENBOTAUTH_TOKEN",
  );
}

export function registerObaCli(program: Command): void {
  const oba = program
    .command("oba")
    .description("OpenBotAuth (OBA) publisher signing tools")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/oba-verification", "docs.openclaw.ai/oba-verification")}\n`,
    );

  // --- login ---
  oba
    .command("login")
    .description("Log in to OpenBotAuth via browser (creates API token)")
    .option("--api-url <url>", "API base URL", "https://api.openbotauth.org")
    .option("--timeout <seconds>", "Login timeout in seconds", "180")
    .option("--manual", "Show URL instead of auto-opening browser", false)
    .action(async (opts: { apiUrl: string; timeout: string; manual?: boolean }) => {
      const timeoutMs = Number(opts.timeout) * 1000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000) {
        defaultRuntime.log("Error: timeout must be at least 10 seconds");
        process.exitCode = 1;
        return;
      }

      const result = await loginOba({
        apiUrl: opts.apiUrl,
        timeoutMs,
        openBrowser: async (url) => {
          if (opts.manual) {
            defaultRuntime.log(`Open this URL in your browser:\n  ${url}`);
          } else {
            defaultRuntime.log("Opening browser...");
            const opened = await openUrl(url);
            if (!opened) {
              defaultRuntime.log(`Could not open browser. Visit this URL manually:\n  ${url}`);
            } else {
              defaultRuntime.log(theme.muted(`If the browser didn't open, visit:\n  ${url}`));
            }
          }
        },
        onProgress: (msg) => defaultRuntime.log(theme.muted(msg)),
      });

      if (!result.ok) {
        defaultRuntime.log(`Login failed: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      const tokenFile = saveObaToken(result.token!);
      defaultRuntime.log(`Login successful! Token saved to ${tokenFile}`);
      defaultRuntime.log(theme.muted("Next: openclaw oba keygen && openclaw oba register"));
    });

  // --- keygen ---
  oba
    .command("keygen")
    .description("Generate a new Ed25519 key pair for signing")
    .option("--owner <url>", "JWKS URL where the public key will be served")
    .option("--json", "Output as JSON", false)
    .action((opts: { owner?: string; json?: boolean }) => {
      if (opts.owner) {
        const urlResult = validateOwnerUrl(opts.owner);
        if (!urlResult.ok) {
          defaultRuntime.log(`Error: ${urlResult.error}`);
          process.exitCode = 1;
          return;
        }
      }

      const key = generateObaKeyPair(opts.owner);
      saveObaKey(key);

      if (opts.json) {
        defaultRuntime.log(
          JSON.stringify(
            {
              kid: key.kid,
              x: publicKeyToJwkX(key.publicKeyPem),
              owner: key.owner ?? null,
              createdAt: key.createdAt,
            },
            null,
            2,
          ),
        );
        return;
      }

      const rich = isRich();
      const heading = (t: string) => (rich ? theme.heading(t) : t);
      const muted = (t: string) => (rich ? theme.muted(t) : t);
      const lines: string[] = [];
      lines.push(heading("OBA key pair generated"));
      lines.push(`  kid:   ${key.kid}`);
      lines.push(`  x:     ${publicKeyToJwkX(key.publicKeyPem)}`);
      if (key.owner) {
        lines.push(`  owner: ${key.owner}`);
      }
      lines.push("");
      lines.push(muted("Next steps:"));
      if (!key.owner) {
        lines.push(
          muted("  1. Set owner URL when signing: openclaw oba sign plugin <path> --owner <url>"),
        );
      }
      lines.push(
        muted(`  ${key.owner ? "1" : "2"}. Register key: openclaw oba register --token <pat>`),
      );
      lines.push(
        muted(`  ${key.owner ? "2" : "3"}. Sign a manifest: openclaw oba sign plugin <path>`),
      );
      defaultRuntime.log(lines.join("\n"));
    });

  // --- keys ---
  oba
    .command("keys")
    .description("List local OBA key pairs")
    .option("--json", "Output as JSON", false)
    .action((opts: { json?: boolean }) => {
      const keys = listObaKeys();
      if (opts.json) {
        defaultRuntime.log(
          JSON.stringify(
            keys.map((k) => ({
              kid: k.kid,
              x: publicKeyToJwkX(k.publicKeyPem),
              owner: k.owner ?? null,
              createdAt: k.createdAt,
            })),
            null,
            2,
          ),
        );
        return;
      }

      if (keys.length === 0) {
        defaultRuntime.log("No OBA keys found. Run: openclaw oba keygen");
        return;
      }

      const rich = isRich();
      const heading = (t: string) => (rich ? theme.heading(t) : t);
      const muted = (t: string) => (rich ? theme.muted(t) : t);
      const lines: string[] = [heading(`OBA keys (${keys.length})`)];
      for (const k of keys) {
        lines.push(`  ${k.kid}  ${muted(k.owner ?? "(no owner)")}  ${muted(k.createdAt)}`);
      }
      defaultRuntime.log(lines.join("\n"));
    });

  // --- sign ---
  const sign = oba.command("sign").description("Sign a plugin manifest or skill metadata");

  sign
    .command("plugin")
    .description("Sign an openclaw.plugin.json manifest")
    .argument("<path>", "Path to openclaw.plugin.json")
    .option("--kid <id>", "Key ID to use (default: most recent)")
    .option("--owner <url>", "Override owner JWKS URL")
    .option("--verify", "Verify signature after signing (requires network)", false)
    .option("--json", "Output as JSON", false)
    .action(
      async (
        manifestPath: string,
        opts: { kid?: string; owner?: string; verify?: boolean; json?: boolean },
      ) => {
        const resolved = path.resolve(manifestPath);
        if (!fs.existsSync(resolved)) {
          defaultRuntime.log(`Error: file not found: ${resolved}`);
          process.exitCode = 1;
          return;
        }

        const key = resolveKey(opts.kid);
        const { kid, sig } = signPluginManifest({
          manifestPath: resolved,
          key,
          ownerOverride: opts.owner,
        });

        let verification: string | undefined;
        if (opts.verify) {
          const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as Record<string, unknown>;
          const result = await verifyObaContainer(raw);
          verification = result.status;
        }

        if (opts.json) {
          defaultRuntime.log(JSON.stringify({ kid, sig, verification }, null, 2));
          return;
        }

        const lines: string[] = [];
        lines.push(`Signed ${path.basename(resolved)} with kid=${kid}`);
        if (verification) {
          const label =
            verification === "verified" ? theme.success("verified") : theme.error(verification);
          lines.push(`Verification: ${label}`);
        }
        defaultRuntime.log(lines.join("\n"));
      },
    );

  sign
    .command("skill")
    .description("Sign a SKILL.md metadata block")
    .argument("<path>", "Path to SKILL.md")
    .option("--kid <id>", "Key ID to use (default: most recent)")
    .option("--owner <url>", "Override owner JWKS URL")
    .option("--verify", "Verify after signing (requires network)", false)
    .option("--json", "Output as JSON", false)
    .action(
      async (
        skillPath: string,
        opts: { kid?: string; owner?: string; verify?: boolean; json?: boolean },
      ) => {
        const resolved = path.resolve(skillPath);
        if (!fs.existsSync(resolved)) {
          defaultRuntime.log(`Error: file not found: ${resolved}`);
          process.exitCode = 1;
          return;
        }

        const key = resolveKey(opts.kid);
        const { kid, sig } = signSkillMetadata({
          skillPath: resolved,
          key,
          ownerOverride: opts.owner,
        });

        let verification: string | undefined;
        if (opts.verify) {
          try {
            const content = fs.readFileSync(resolved, "utf-8");
            const parsed = parseSkillMetadataObject(content);
            const result = await verifyObaContainer(parsed);
            verification = result.status;
          } catch {
            verification = "invalid";
          }
        }

        if (opts.json) {
          defaultRuntime.log(JSON.stringify({ kid, sig, verification }, null, 2));
          return;
        }

        const lines: string[] = [];
        lines.push(`Signed ${path.basename(resolved)} with kid=${kid}`);
        if (verification) {
          const label =
            verification === "verified" ? theme.success("verified") : theme.error(verification);
          lines.push(`Verification: ${label}`);
        }
        defaultRuntime.log(lines.join("\n"));
      },
    );

  // --- register ---
  oba
    .command("register")
    .description("Register key as an agent with OpenBotAuth registry")
    .option("--kid <id>", "Key ID to register (default: most recent)")
    .option("--name <name>", "Agent name (default: key kid)")
    .option("--agent-type <type>", "Agent type (default: publisher)")
    .option("--token <pat>", "OpenBotAuth API token")
    .option("--api-url <url>", "API base URL", "https://api.openbotauth.org")
    .action(
      async (opts: {
        kid?: string;
        name?: string;
        agentType?: string;
        token?: string;
        apiUrl?: string;
      }) => {
        const key = resolveKey(opts.kid);
        const token = resolveToken(opts.token);

        const action = key.agentId ? "Updating" : "Registering";
        defaultRuntime.log(`${action} agent for key ${key.kid}...`);

        const result = await registerAgent({
          kid: key.kid,
          publicKeyPem: key.publicKeyPem,
          name: opts.name,
          agentType: opts.agentType,
          agentId: key.agentId,
          token,
          apiUrl: opts.apiUrl,
        });

        if (!result.ok) {
          defaultRuntime.log(`Error: ${result.error}`);
          process.exitCode = 1;
          return;
        }

        // Update key file with agentId + owner URL.
        if (result.agentId) {
          key.agentId = result.agentId;
        }
        if (result.ownerUrl) {
          key.owner = result.ownerUrl;
        }
        saveObaKey(key);

        defaultRuntime.log(`Agent registered successfully.`);
        defaultRuntime.log(`  kid:   ${key.kid}`);
        if (key.agentId) {
          defaultRuntime.log(`  agent: ${key.agentId}`);
        }
        if (key.owner) {
          defaultRuntime.log(`  owner: ${key.owner}`);
        }
      },
    );
}
