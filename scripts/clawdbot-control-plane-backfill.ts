import { getControlPlaneService } from "../src/clawdbot/control-plane/index.ts";

type Role = "viewer" | "operator" | "admin";

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseRole(raw: string | undefined): Role {
  if (raw === "viewer" || raw === "admin") {
    return raw;
  }
  return "operator";
}

async function main(): Promise<void> {
  const service = getControlPlaneService();
  const actor = {
    id: readArg("--actor") ?? "control-plane-backfill-script",
    role: parseRole(readArg("--role")),
    scopes: ["operator.write", "operator.admin"],
  };
  const strict = hasFlag("--strict");

  const result = await service.backfillMetadata(actor);
  const summary = {
    ok: result.ok,
    createdSkills: result.createdSkills,
    createdWorkflows: result.createdWorkflows,
    unresolvedCount: result.unresolved.length,
    unresolved: result.unresolved,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (strict && result.unresolved.length > 0) {
    process.exitCode = 1;
  }
}

await main();
