import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";

import { defaultRuntime } from "../runtime.js";
import {
  generateObaKeyPair,
  listObaKeys,
  loadMostRecentObaKey,
  loadObaKey,
  publicKeyToJwkX,
  saveObaKey,
  type ObaKeyFile,
} from "../security/oba/keys.js";
import { registerPublicKey } from "../security/oba/register.js";
import { signPluginManifest, signSkillMetadata } from "../security/oba/sign.js";
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
  if (tokenOpt) return tokenOpt;
  const envToken = process.env.OPENBOTAUTH_TOKEN?.trim();
  if (envToken) return envToken;
  // Check local token file.
  try {
    const tokenPath = path.join(
      path.dirname(path.dirname(new URL(import.meta.url).pathname)),
      "..",
      "..",
    );
    // Fallback: read from ~/.openclaw/oba/token if it exists.
    const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const tokenFile = path.join(homedir, ".openclaw", "oba", "token");
    if (fs.existsSync(tokenFile)) {
      return fs.readFileSync(tokenFile, "utf-8").trim();
    }
  } catch {
    // ignore
  }
  throw new Error(
    "No API token. Provide --token, set OPENBOTAUTH_TOKEN env var, or save token to ~/.openclaw/oba/token",
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

  // --- keygen ---
  oba
    .command("keygen")
    .description("Generate a new Ed25519 key pair for signing")
    .option("--owner <url>", "JWKS URL where the public key will be served")
    .option("--json", "Output as JSON", false)
    .action((opts: { owner?: string; json?: boolean }) => {
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
          const JSON5 = (await import("json5")).default;
          const content = fs.readFileSync(resolved, "utf-8");
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const metaMatch = fmMatch[1].match(/^metadata:\s*([\s\S]*)$/m);
            if (metaMatch) {
              try {
                const parsed = JSON5.parse(metaMatch[1].trim()) as Record<string, unknown>;
                const result = await verifyObaContainer(parsed);
                verification = result.status;
              } catch {
                verification = "invalid";
              }
            }
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
    .description("Register public key with OpenBotAuth registry")
    .option("--kid <id>", "Key ID to register (default: most recent)")
    .option("--token <pat>", "OpenBotAuth API token")
    .option("--api-url <url>", "API base URL", "https://api.openbotauth.org")
    .action(async (opts: { kid?: string; token?: string; apiUrl?: string }) => {
      const key = resolveKey(opts.kid);
      const token = resolveToken(opts.token);

      defaultRuntime.log(`Registering key ${key.kid}...`);
      const result = await registerPublicKey({
        publicKeyPem: key.publicKeyPem,
        token,
        apiUrl: opts.apiUrl,
      });

      if (!result.ok) {
        defaultRuntime.log(`Error: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      defaultRuntime.log(`Key ${key.kid} registered successfully.`);
      if (key.owner) {
        defaultRuntime.log(`Public key will be served at: ${key.owner}`);
      }
    });
}
