/**
 * θ₁ OBSERVE: イベントログ記録、リアクション処理
 *
 * 問題理解・分析の最初のフェーズ。
 * 入力データを観測し、イベントログを記録する。
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import {
  type ObserveContext,
  ThetaCycleState,
  ThetaEvent,
  ThetaEventType,
  ThetaPhase,
} from "./types.js";

/**
 * 観測を実行する
 *
 * @param state - θサイクル状態
 * @param context - 観測コンテキスト
 * @returns 更新された状態
 */
export async function observe(
  state: ThetaCycleState,
  context: ObserveContext,
): Promise<ThetaCycleState> {
  const { runId } = state;

  // フェーズ開始イベント
  emitPhaseEvent(runId, ThetaEventType.PHASE_START, {
    phase: ThetaPhase.OBSERVE,
    input: context.input,
  });

  try {
    // 入力データの観測
    const observation: ThetaEvent = {
      runId,
      phase: ThetaPhase.OBSERVE,
      timestamp: Date.now(),
      type: ThetaEventType.OBSERVATION,
      data: {
        input: context.input,
        metadata: context.metadata,
        sessionKey: context.sessionKey,
      },
    };

    // 状態を更新
    state.events.push(observation);
    state.currentPhase = ThetaPhase.OBSERVE;
    state.context.set("observe.input", context.input);
    state.context.set("observe.metadata", context.metadata);

    // Agentイベントを発行
    emitAgentEvent({
      runId,
      stream: "tool",
      data: {
        type: "observe",
        input: context.input,
      },
    });

    // フェーズ完了イベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_COMPLETE, {
      phase: ThetaPhase.OBSERVE,
      observationCount: 1,
    });

    return state;
  } catch (error) {
    // エラーイベント
    emitPhaseEvent(runId, ThetaEventType.PHASE_ERROR, {
      phase: ThetaPhase.OBSERVE,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * リアクションを処理する
 *
 * @param state - θサイクル状態
 * @param reaction - リアクションデータ
 * @returns 更新された状態
 */
export async function handleReaction(
  state: ThetaCycleState,
  reaction: Record<string, unknown>,
): Promise<ThetaCycleState> {
  const { runId } = state;

  // リアクション記録
  const reactionEvent: ThetaEvent = {
    runId,
    phase: ThetaPhase.OBSERVE,
    timestamp: Date.now(),
    type: ThetaEventType.OBSERVATION,
    data: {
      type: "reaction",
      reaction,
    },
  };

  state.events.push(reactionEvent);
  state.context.set("observe.reaction", reaction);

  // Agentイベントを発行
  emitAgentEvent({
    runId,
    stream: "tool",
    data: {
      type: "reaction",
      reaction,
    },
  });

  return state;
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

/**
 * 観測ログを取得する
 *
 * @param state - θサイクル状態
 * @returns 観測イベントの配列
 */
export function getObservations(state: ThetaCycleState): ThetaEvent[] {
  return state.events.filter(
    (e) => e.phase === ThetaPhase.OBSERVE && e.type === ThetaEventType.OBSERVATION,
  );
}

// 型のエクスポート
export type { ObserveContext };
