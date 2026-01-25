/**
 * θ₅ VERIFY: 結果検証、品質チェック
 *
 * 実行結果を検証し、品質を評価する。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import {
  type ExecutionResult,
  ThetaCycleState,
  ThetaEvent,
  ThetaEventType,
  ThetaPhase,
} from "./types.js";
import type { VerificationResult } from "./types.js";

// 型のエクスポート
export type { VerificationResult };

/**
 * 品質チェック項目の定義
 */
interface QualityCheck {
  /** チェック名 */
  name: string;
  /** チェック関数 */
  check: (result: ExecutionResult) => boolean | Promise<boolean>;
  /** 重大度 */
  severity: "critical" | "major" | "minor";
}

/** デフォルトの品質チェック一覧 */
const DEFAULT_QUALITY_CHECKS: QualityCheck[] = [
  {
    name: "execution_success",
    check: (result) => result.success,
    severity: "critical",
  },
  {
    name: "has_output",
    check: (result) => result.data !== undefined && result.data !== null,
    severity: "major",
  },
  {
    name: "reasonable_duration",
    check: (result) => result.duration < 60000, // 1分以内
    severity: "minor",
  },
  {
    name: "no_critical_errors",
    check: (result) => {
      if (!result.error) return true;
      const errorMsg = result.error.message.toLowerCase();
      return !errorMsg.includes("critical") && !errorMsg.includes("fatal");
    },
    severity: "critical",
  },
];

/**
 * 検証を実行する
 *
 * @param state - θサイクル状態
 * @param customChecks - カスタム品質チェック（オプション）
 * @returns 更新された状態と検証結果
 */
export async function verify(
  state: ThetaCycleState,
  customChecks?: QualityCheck[],
): Promise<{ state: ThetaCycleState; result: VerificationResult }> {
  const { runId } = state;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.VERIFY,
  });

  try {
    // 実行結果の取得
    const executionResult = state.context.get("execute.result") as ExecutionResult | undefined;

    if (!executionResult) {
      throw new Error("Execution result not found");
    }

    // 品質チェックの実行
    const checks = customChecks ?? DEFAULT_QUALITY_CHECKS;
    const checkResults: Record<string, boolean> = {};
    const failures: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const check of checks) {
      const passed = await check.check(executionResult);
      checkResults[check.name] = passed;

      // 重み付け（critical: 5, major: 3, minor: 1）
      const weight = check.severity === "critical" ? 5 : check.severity === "major" ? 3 : 1;
      totalWeight += weight;

      if (passed) {
        totalScore += weight;
      } else {
        failures.push(`${check.name} (${check.severity})`);
      }
    }

    // 品質スコアの計算 (0-1)
    const qualityScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    const result: VerificationResult = {
      passed: qualityScore >= 0.6, // 60%以上でパス
      qualityScore,
      checks: checkResults,
      failures: failures.length > 0 ? failures : undefined,
    };

    // 検証イベント記録
    const verificationEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.VERIFY,
      timestamp: Date.now(),
      type: ThetaEventType.VERIFICATION,
      data: {
        result,
      },
    };

    state.events.push(verificationEvent);
    state.currentPhase = ThetaPhase.VERIFY;
    state.context.set("verify.result", result);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "verify",
        passed: result.passed,
        qualityScore: result.qualityScore,
        failures: result.failures,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.VERIFY,
      passed: result.passed,
      qualityScore: result.qualityScore,
    });

    return { state, result };
  } catch (error) {
    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.VERIFY,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 検証結果を取得する
 *
 * @param state - θサイクル状態
 * @returns 検証結果
 */
export function getVerificationResult(state: ThetaCycleState): VerificationResult | undefined {
  return state.context.get("verify.result") as VerificationResult | undefined;
}

/**
 * 品質チェックを追加する
 *
 * @param checks - 既存チェック配列
 * @param newCheck - 追加するチェック
 * @returns 更新されたチェック配列
 */
export function addQualityCheck(checks: QualityCheck[], newCheck: QualityCheck): QualityCheck[] {
  return [...checks, newCheck];
}

/**
 * カスタム品質チェックを作成する
 *
 * @param name - チェック名
 * @param check - チェック関数
 * @param severity - 重大度
 * @returns 品質チェック定義
 */
export function createQualityCheck(
  name: string,
  check: (result: ExecutionResult) => boolean | Promise<boolean>,
  severity: "critical" | "major" | "minor" = "major",
): QualityCheck {
  return { name, check, severity };
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
