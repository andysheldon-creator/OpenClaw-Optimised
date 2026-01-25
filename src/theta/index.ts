/**
 * θサイクル (Theta Cycle) - エントリーポイント
 *
 * Agent(Intent, World₀) = lim_{n→∞} (θ₆ ∘ θ₅ ∘ θ₄ ∘ θ₃ ∘ θ₂ ∘ θ₁)ⁿ
 *
 * 完全なθサイクル実行を提供する。
 */

// 型定義のエクスポート
export type {
  // 共通型
  ThetaCycleState,
  ThetaCycleOptions,
  ThetaEvent,
  ThetaEventType,

  // 各フェーズ関連
  ObserveContext,
  AnalysisResult,
  DecisionResult,
  ExecuteOptions,
  ExecutionResult,
  VerificationResult,
  ImprovementSuggestion,
} from "./types.js";

export { ThetaPhase } from "./types.js";

// θ₁ OBSERVE
export { observe, handleReaction, getObservations } from "./observe.js";

// θ₂ ANALYZE
export { analyze, getAnalysisResult } from "./analyze.js";

// θ₃ DECIDE
export { decide, getDecisionResult, getAvailableAgents, getAvailableStrategies } from "./decide.js";

// θ₄ EXECUTE
export { execute, executeBackground, getExecutionResult } from "./execute.js";

// θ₅ VERIFY
export { verify, getVerificationResult, addQualityCheck, createQualityCheck } from "./verify.js";

// θ₆ IMPROVE
export {
  improve,
  getImprovementSuggestions,
  addImprovementPattern,
  createImprovementPattern,
  generateCycleSummary,
} from "./improve.js";

// 完全なサイクル実行
import { observe, handleReaction, type ObserveContext } from "./observe.js";
import { analyze, type AnalysisResult } from "./analyze.js";
import { decide, type DecisionResult } from "./decide.js";
import { execute, type ExecuteOptions, type ExecutionResult } from "./execute.js";
import { verify, type VerificationResult } from "./verify.js";
import { improve, generateCycleSummary, type ImprovementSuggestion } from "./improve.js";
import type { ThetaCycleOptions, ThetaCycleState } from "./types.js";
import { ThetaPhase } from "./types.js";

/**
 * 新しいθサイクル状態を作成する
 */
export function createThetaCycleState(runId: string, options?: ThetaCycleOptions): ThetaCycleState {
  return {
    runId,
    startTime: Date.now(),
    currentPhase: null,
    events: [],
    context: new Map(),
  };
}

/**
 * 完全なθサイクルを実行する
 *
 * @param input - 入力データ
 * @param executor - 実行関数
 * @param options - サイクルオプション
 * @returns サイクル結果
 */
export async function runThetaCycle<T = unknown>(
  input: unknown,
  executor: (params: Record<string, unknown>) => Promise<T>,
  options?: ThetaCycleOptions & Partial<ExecuteOptions>,
): Promise<{
  state: ThetaCycleState;
  analysis: AnalysisResult;
  decision: DecisionResult;
  execution: ExecutionResult;
  verification: VerificationResult;
  suggestions: ImprovementSuggestion[];
}> {
  const runId = `theta_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const state = createThetaCycleState(runId, options);

  // オプションのマージ
  const timeout = options?.defaultTimeout ?? 30000;
  const retries = options?.defaultRetries ?? 3;

  // θ₁ OBSERVE
  const observeState = await observe(state, { input });

  // θ₂ ANALYZE
  const analyzeResult = await analyze(observeState);
  const analyzeState = analyzeResult.state;

  // θ₃ DECIDE
  const decideResult = await decide(analyzeState);
  const decideState = decideResult.state;

  // θ₄ EXECUTE
  const executeResult = await execute<T>(decideState, decideResult.result, executor, {
    timeout,
    retries,
  });
  const executeState = executeResult.state;

  // θ₅ VERIFY
  const verifyResult = await verify(executeState);
  const verifyState = verifyResult.state;

  // θ₆ IMPROVE
  const improveResult = await improve(verifyState);
  const improveState = improveResult.state;

  // サマリー生成
  const summary = generateCycleSummary(improveState);

  // オプションのコールバック
  if (options?.onEvent) {
    for (const event of improveState.events) {
      options.onEvent(event);
    }
  }

  return {
    state: improveState,
    analysis: analyzeResult.result,
    decision: decideResult.result,
    execution: executeResult.result,
    verification: verifyResult.result,
    suggestions: improveResult.suggestions,
  };
}

/**
 * θサイクルをストリームモードで実行する
 * 各フェーズの完了時にコールバックを呼び出す
 *
 * @param input - 入力データ
 * @param executor - 実行関数
 * @param onPhase - フェーズ完了時のコールバック
 * @param options - サイクルオプション
 * @returns 最終的なサイクル結果
 */
export async function runThetaCycleStream<T = unknown>(
  input: unknown,
  executor: (params: Record<string, unknown>) => Promise<T>,
  onPhase: (phase: ThetaPhase, data: unknown) => void,
  options?: ThetaCycleOptions & Partial<ExecuteOptions>,
): Promise<{
  state: ThetaCycleState;
  analysis: AnalysisResult;
  decision: DecisionResult;
  execution: ExecutionResult;
  verification: VerificationResult;
  suggestions: ImprovementSuggestion[];
}> {
  const runId = `theta_stream_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const state = createThetaCycleState(runId, options);

  const timeout = options?.defaultTimeout ?? 30000;
  const retries = options?.defaultRetries ?? 3;

  // θ₁ OBSERVE
  let currentState = await observe(state, { input });
  onPhase(ThetaPhase.OBSERVE, currentState.events);

  // θ₂ ANALYZE
  const analyzeResult = await analyze(currentState);
  currentState = analyzeResult.state;
  onPhase(ThetaPhase.ANALYZE, analyzeResult.result);

  // θ₃ DECIDE
  const decideResult = await decide(currentState);
  currentState = decideResult.state;
  onPhase(ThetaPhase.DECIDE, decideResult.result);

  // θ₄ EXECUTE
  const executeResult = await execute<T>(currentState, decideResult.result, executor, {
    timeout,
    retries,
  });
  currentState = executeResult.state;
  onPhase(ThetaPhase.EXECUTE, executeResult.result);

  // θ₅ VERIFY
  const verifyResult = await verify(currentState);
  currentState = verifyResult.state;
  onPhase(ThetaPhase.VERIFY, verifyResult.result);

  // θ₆ IMPROVE
  const improveResult = await improve(currentState);
  currentState = improveResult.state;
  onPhase(ThetaPhase.IMPROVE, improveResult.suggestions);

  return {
    state: currentState,
    analysis: analyzeResult.result,
    decision: decideResult.result,
    execution: executeResult.result,
    verification: verifyResult.result,
    suggestions: improveResult.suggestions,
  };
}

/**
 * θサイクルの実行を一時停止/再開するためのチェックポイントを作成する
 *
 * @param state - 現在のサイクル状態
 * @returns シリアライズ可能なチェックポイントデータ
 */
export function createCheckpoint(state: ThetaCycleState): {
  runId: string;
  startTime: number;
  currentPhase: ThetaPhase | null;
  context: Record<string, unknown>;
  eventCount: number;
} {
  return {
    runId: state.runId,
    startTime: state.startTime,
    currentPhase: state.currentPhase,
    context: Object.fromEntries(state.context.entries()),
    eventCount: state.events.length,
  };
}

/**
 * チェックポイントからサイクル状態を復元する
 *
 * @param checkpoint - チェックポイントデータ
 * @returns 復元されたサイクル状態
 */
export function restoreFromCheckpoint(checkpoint: {
  runId: string;
  startTime: number;
  currentPhase: ThetaPhase | null;
  context: Record<string, unknown>;
}): ThetaCycleState {
  return {
    runId: checkpoint.runId,
    startTime: checkpoint.startTime,
    currentPhase: checkpoint.currentPhase,
    events: [],
    context: new Map(Object.entries(checkpoint.context)),
  };
}
