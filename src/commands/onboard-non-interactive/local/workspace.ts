import type { OpenClawConfig } from "../../../config/config.js";
import type { OnboardOptions } from "../../onboard-types.js";
import { normalizeWorkspacePath } from "../../../agents/workspace.js";
import { resolveUserPath } from "../../../utils.js";

export function resolveNonInteractiveWorkspaceDir(params: {
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  defaultWorkspaceDir: string;
}) {
  const fromConfig = params.baseConfig.agents?.defaults?.workspace;
  const raw = (
    params.opts.workspace ??
    (fromConfig ? normalizeWorkspacePath(fromConfig) : undefined) ??
    params.defaultWorkspaceDir
  ).trim();
  return resolveUserPath(raw);
}
