export type { GatesConfig, GateResult, SessionBuffer } from "./budget.js";
export {
  DEFAULT_GATES_CONFIG,
  ensureBuffer,
  pruneOldEntries,
  checkGates,
  recordCapture,
  recordEvaluation,
} from "./budget.js";
