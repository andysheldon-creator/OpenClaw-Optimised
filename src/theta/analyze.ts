/**
 * θ₂ ANALYZE: 意図解析、コンテキスト取得
 *
 * 観測データを分析し、意図を抽出する。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import {
  type AnalysisResult,
  ThetaCycleState,
  ThetaEvent,
  ThetaEventType,
  ThetaPhase,
} from "./types.js";

// 型のエクスポート
export type { AnalysisResult };

/**
 * 分析を実行する
 *
 * @param state - θサイクル状態
 * @returns 更新された状態と分析結果
 */
export async function analyze(
  state: ThetaCycleState,
): Promise<{ state: ThetaCycleState; result: AnalysisResult }> {
  const { runId } = state;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.ANALYZE,
  });

  try {
    // 入力データの取得
    const input = state.context.get("observe.input");
    const metadata = state.context.get("observe.metadata") as Record<string, unknown> | undefined;

    // 意図解析
    const intent = extractIntent(input);
    const entities = extractEntities(input);
    const context = buildContext(input, metadata);
    const confidence = calculateConfidence(intent, entities);

    const result: AnalysisResult = {
      intent,
      entities,
      context,
      confidence,
    };

    // 分析イベント記録
    const analysisEvent: ThetaEvent = {
      runId,
      phase: ThetaPhase.ANALYZE,
      timestamp: Date.now(),
      type: ThetaEventType.ANALYSIS,
      data: {
        result,
      },
    };

    state.events.push(analysisEvent);
    state.currentPhase = ThetaPhase.ANALYZE;
    state.context.set("analyze.result", result);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "analyze",
        intent,
        entities,
        confidence,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.ANALYZE,
      intent,
      confidence,
    });

    return { state, result };
  } catch (error) {
    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.ANALYZE,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 入力から意図を抽出する
 */
function extractIntent(input: unknown): string {
  if (typeof input === "string") {
    // 簡易的な意図抽出（実際はLLM等を使用）
    const lowerInput = input.toLowerCase();
    if (lowerInput.includes("create") || lowerInput.includes("new")) {
      return "create";
    }
    if (lowerInput.includes("delete") || lowerInput.includes("remove")) {
      return "delete";
    }
    if (lowerInput.includes("update") || lowerInput.includes("modify")) {
      return "update";
    }
    if (lowerInput.includes("search") || lowerInput.includes("find")) {
      return "search";
    }
    return "unknown";
  }
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.intent === "string") {
      return obj.intent;
    }
  }
  return "unknown";
}

/**
 * 入力からエンティティを抽出する
 */
function extractEntities(input: unknown): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    // よく使われるエンティティキーを抽出
    const entityKeys = ["name", "id", "type", "value", "target", "source"];
    for (const key of entityKeys) {
      if (key in obj) {
        entities[key] = obj[key];
      }
    }
  }

  return entities;
}

/**
 * コンテキストを構築する
 */
function buildContext(input: unknown, metadata?: Record<string, unknown>): Record<string, unknown> {
  return {
    inputType: typeof input,
    hasMetadata: metadata !== undefined,
    metadataKeys: metadata ? Object.keys(metadata) : [],
    timestamp: Date.now(),
  };
}

/**
 * 信頼度を計算する
 */
function calculateConfidence(intent: string, entities: Record<string, unknown>): number {
  let score = 0.5; // 基本スコア

  // 意図が特定できている
  if (intent !== "unknown") {
    score += 0.2;
  }

  // エンティティが抽出できている
  if (Object.keys(entities).length > 0) {
    score += 0.1 * Math.min(Object.keys(entities).length, 3);
  }

  return Math.min(score, 1.0);
}

/**
 * 分析結果を取得する
 *
 * @param state - θサイクル状態
 * @returns 分析結果
 */
export function getAnalysisResult(state: ThetaCycleState): AnalysisResult | undefined {
  return state.context.get("analyze.result") as AnalysisResult | undefined;
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
