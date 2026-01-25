/**
 * θサイクル (Theta Cycle) の型定義
 *
 * Agent(Intent, World₀) = lim_{n→∞} (θ₆ ∘ θ₅ ∘ θ₄ ∘ θ₃ ∘ θ₂ ∘ θ₁)ⁿ
 */

/**
 * θサイクルの各フェーズ
 */
export enum ThetaPhase {
  OBSERVE = "θ₁ OBSERVE",
  ANALYZE = "θ₂ ANALYZE",
  DECIDE = "θ₃ DECIDE",
  EXECUTE = "θ₄ EXECUTE",
  VERIFY = "θ₅ VERIFY",
  IMPROVE = "θ₆ IMPROVE",
}

/**
 * イベントログの型
 */
export interface ThetaEvent {
  /** 実行ID */
  runId: string;
  /** フェーズ */
  phase: ThetaPhase;
  /** タイムスタンプ */
  timestamp: number;
  /** イベント種別 */
  type: ThetaEventType;
  /** データ */
  data: Record<string, unknown>;
}

/**
 * イベント種別
 */
export enum ThetaEventType {
  /** フェーズ開始 */
  PHASE_START = "phase_start",
  /** フェーズ完了 */
  PHASE_COMPLETE = "phase_complete",
  /** フェーズエラー */
  PHASE_ERROR = "phase_error",
  /** 観測データ記録 */
  OBSERVATION = "observation",
  /** 分析結果 */
  ANALYSIS = "analysis",
  /** 決定 */
  DECISION = "decision",
  /** 実行結果 */
  EXECUTION = "execution",
  /** 検証結果 */
  VERIFICATION = "verification",
  /** 改善提案 */
  IMPROVEMENT = "improvement",
}

/**
 * 観測コンテキスト (OBSERVE用)
 */
export interface ObserveContext {
  /** セッションキー */
  sessionKey?: string;
  /** 入力データ */
  input: unknown;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * 分析結果 (ANALYZE用)
 */
export interface AnalysisResult {
  /** 意図解析結果 */
  intent: string;
  /** 抽出されたエンティティ */
  entities: Record<string, unknown>;
  /** コンテキスト情報 */
  context: Record<string, unknown>;
  /** 信頼度 */
  confidence: number;
}

/**
 * 決定結果 (DECIDE用)
 */
export interface DecisionResult {
  /** 選択された処理方針 */
  strategy: string;
  /** 選択されたエージェント */
  agent?: string;
  /** パラメータ */
  params: Record<string, unknown>;
  /** 推定実行時間(ms) */
  estimatedDuration?: number;
}

/**
 * 実行オプション (EXECUTE用)
 */
export interface ExecuteOptions {
  /** タイムアウト(ms) */
  timeout: number;
  /** リトライ回数 */
  retries: number;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
}

/**
 * 実行結果 (EXECUTE用)
 */
export interface ExecutionResult {
  /** 成功判定 */
  success: boolean;
  /** 結果データ */
  data?: unknown;
  /** エラー情報 */
  error?: Error;
  /** 実行時間(ms) */
  duration: number;
}

/**
 * 検証結果 (VERIFY用)
 */
export interface VerificationResult {
  /** 検証パス */
  passed: boolean;
  /** 品質スコア (0-1) */
  qualityScore: number;
  /** 検証項目ごとの結果 */
  checks: Record<string, boolean>;
  /** 失敗理由 */
  failures?: string[];
}

/**
 * 改善提案 (IMPROVE用)
 */
export interface ImprovementSuggestion {
  /** 改善内容 */
  suggestion: string;
  /** 適用対象 */
  target: string;
  /** 優先度 */
  priority: "low" | "medium" | "high";
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * θサイクルの完全な実行状態
 */
export interface ThetaCycleState {
  /** 実行ID */
  runId: string;
  /** 開始時刻 */
  startTime: number;
  /** 現在のフェーズ */
  currentPhase: ThetaPhase | null;
  /** イベントログ */
  events: ThetaEvent[];
  /** コンテキスト */
  context: Map<string, unknown>;
}

/**
 * θサイクルの設定
 */
export interface ThetaCycleOptions {
  /** デフォルトタイムアウト(ms) */
  defaultTimeout?: number;
  /** デフォルトリトライ回数 */
  defaultRetries?: number;
  /** 詳細ログレベル */
  verbose?: boolean;
  /** カスタムイベントハンドラ */
  onEvent?: (event: ThetaEvent) => void;
}
