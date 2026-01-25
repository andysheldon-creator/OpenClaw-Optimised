/**
 * θ₆ IMPROVE: ログ照合、改善提案
 *
 * 実行結果を分析し、改善提案を生成する。
 * 学習サイクルを完結させる。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import { ThetaCycleState, ThetaEvent, ThetaEventType, ThetaPhase } from "./types.js";
import type { AnalysisResult, ImprovementSuggestion, VerificationResult } from "./types.js";

// 型のエクスポート
export type { ImprovementSuggestion };

/**
 * 改善パターンの定義
 */
interface ImprovementPattern {
  /** パターンID */
  id: string;
  /** パターンマッチ条件 */
  match: (context: ThetaCycleState) => boolean;
  /** 改善提案生成関数 */
  suggest: (context: ThetaCycleState) => ImprovementSuggestion;
}

/** デフォルトの改善パターン一覧 */
const DEFAULT_IMPROVEMENT_PATTERNS: ImprovementPattern[] = [
  {
    id: "failed_execution",
    match: (ctx) => {
      const result = ctx.context.get("execute.result") as { success?: boolean } | undefined;
      return result?.success === false;
    },
    suggest: () => ({
      suggestion:
        "Execution failed. Review error logs and consider retry with different parameters.",
      target: "execution",
      priority: "high",
    }),
  },
  {
    id: "low_quality_score",
    match: (ctx) => {
      const result = ctx.context.get("verify.result") as VerificationResult | undefined;
      return result?.qualityScore !== undefined && result.qualityScore < 0.6;
    },
    suggest: (ctx) => {
      const result = ctx.context.get("verify.result") as VerificationResult | undefined;
      return {
        suggestion: `Quality score below threshold (${result?.qualityScore?.toFixed(2)}). Review failed checks: ${result?.failures?.join(", ")}`,
        target: "quality",
        priority: "medium",
      };
    },
  },
  {
    id: "slow_execution",
    match: (ctx) => {
      const result = ctx.context.get("execute.result") as { duration?: number } | undefined;
      return result?.duration !== undefined && result.duration > 10000; // 10秒超過
    },
    suggest: (ctx) => {
      const result = ctx.context.get("execute.result") as { duration?: number } | undefined;
      return {
        suggestion: `Execution took ${result?.duration}ms. Consider optimization or caching.`,
        target: "performance",
        priority: "low",
        metadata: { duration: result?.duration },
      };
    },
  },
  {
    id: "unknown_intent",
    match: (ctx) => {
      const result = ctx.context.get("analyze.result") as AnalysisResult | undefined;
      return result?.intent === "unknown";
    },
    suggest: () => ({
      suggestion:
        "Intent was not recognized. Consider expanding intent patterns or adding training data.",
      target: "analysis",
      priority: "medium",
    }),
  },
  {
    id: "low_confidence",
    match: (ctx) => {
      const result = ctx.context.get("analyze.result") as AnalysisResult | undefined;
      return result?.confidence !== undefined && result.confidence < 0.5;
    },
    suggest: (ctx) => {
      const result = ctx.context.get("analyze.result") as AnalysisResult | undefined;
      return {
        suggestion: `Analysis confidence low (${result?.confidence?.toFixed(2)}). Additional context may improve accuracy.`,
        target: "analysis",
        priority: "low",
        metadata: { confidence: result?.confidence },
      };
    },
  },
  {
    id: "successful_execution",
    match: (ctx) => {
      const execResult = ctx.context.get("execute.result") as { success?: boolean } | undefined;
      const verifyResult = ctx.context.get("verify.result") as VerificationResult | undefined;
      return execResult?.success === true && verifyResult?.passed === true;
    },
    suggest: () => ({
      suggestion:
        "Execution completed successfully. Consider documenting this pattern for future reference.",
      target: "documentation",
      priority: "low",
    }),
  },
];

/**
 * 改善を実行する
 *
 * @param state - θサイクル状態
 * @param customPatterns - カスタム改善パターン（オプション）
 * @returns 更新された状態と改善提案の配列
 */
export async function improve(
  state: ThetaCycleState,
  customPatterns?: ImprovementPattern[],
): Promise<{ state: ThetaCycleState; suggestions: ImprovementSuggestion[] }> {
  const { runId } = state;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.IMPROVE,
  });

  try {
    // 改善パターンの評価
    const patterns = customPatterns ?? DEFAULT_IMPROVEMENT_PATTERNS;
    const suggestions: ImprovementSuggestion[] = [];

    for (const pattern of patterns) {
      if (pattern.match(state)) {
        suggestions.push(pattern.suggest(state));
      }
    }

    // 改善イベント記録
    const improvementEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.IMPROVE,
      timestamp: Date.now(),
      type: ThetaEventType.IMPROVEMENT,
      data: {
        suggestions,
        count: suggestions.length,
      },
    };

    state.events.push(improvementEvent);
    state.currentPhase = ThetaPhase.IMPROVE;
    state.context.set("improve.suggestions", suggestions);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "improve",
        suggestions,
        count: suggestions.length,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.IMPROVE,
      suggestionCount: suggestions.length,
    });

    return { state, suggestions };
  } catch (error) {
    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.IMPROVE,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 改善提案を取得する
 *
 * @param state - θサイクル状態
 * @returns 改善提案の配列
 */
export function getImprovementSuggestions(state: ThetaCycleState): ImprovementSuggestion[] {
  return (state.context.get("improve.suggestions") as ImprovementSuggestion[]) ?? [];
}

/**
 * 改善パターンを追加する
 *
 * @param patterns - 既存パターン配列
 * @param newPattern - 追加するパターン
 * @returns 更新されたパターン配列
 */
export function addImprovementPattern(
  patterns: ImprovementPattern[],
  newPattern: ImprovementPattern,
): ImprovementPattern[] {
  return [...patterns, newPattern];
}

/**
 * カスタム改善パターンを作成する
 *
 * @param id - パターンID
 * @param match - マッチ条件関数
 * @param suggest - 改善提案生成関数
 * @returns 改善パターン定義
 */
export function createImprovementPattern(
  id: string,
  match: (context: ThetaCycleState) => boolean,
  suggest: (context: ThetaCycleState) => ImprovementSuggestion,
): ImprovementPattern {
  return { id, match, suggest };
}

/**
 * サイクル全体のサマリーを生成する
 *
 * @param state - θサイクル状態
 * @returns サマリーオブジェクト
 */
export function generateCycleSummary(state: ThetaCycleState): {
  runId: string;
  duration: number;
  phases: ThetaPhase[];
  eventCount: number;
  success: boolean;
  suggestions: ImprovementSuggestion[];
} {
  const startTime = state.startTime;
  const endTime = Date.now();
  const duration = endTime - startTime;

  const phases = state.events.map((e) => e.phase).filter((p, i, arr) => arr.indexOf(p) === i); // ユニークなフェーズのみ

  const executionResult = state.context.get("execute.result") as { success?: boolean } | undefined;
  const success = executionResult?.success ?? false;

  const suggestions = getImprovementSuggestions(state);

  return {
    runId: state.runId,
    duration,
    phases,
    eventCount: state.events.length,
    success,
    suggestions,
  };
}

/**
 * フェーズイベントを発行する
 */
function emitPhaseEvent(runId: string, type: ThetaEventType, data: Record<string, unknown>): void {
  emitAgentEvent({
    runId,
    stream: "tool",
    data: {
      type: "theta_event",
      thetaEventType: type,
      ...data,
    },
  });
}
