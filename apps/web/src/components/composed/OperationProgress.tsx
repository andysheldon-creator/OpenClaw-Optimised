"use client";

import {
  CheckCircle2,
  XCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OperationState, OperationProgress as OperationProgressData } from "@/hooks/useAsyncOperation";

// ─── Props ──────────────────────────────────────────────────────

export interface OperationProgressProps {
  /** Current operation state */
  state: OperationState;
  /** Progress data (when state is "running") */
  progress: OperationProgressData | null;
  /** Error object (when state is "error") */
  error: Error | null;
  /** Title of the operation */
  title?: string;
  /** Success message */
  successMessage?: string;
  /** Callback to retry on error */
  onRetry?: () => void;
  /** Callback to dismiss */
  onDismiss?: () => void;
  /** Whether to show as inline or banner */
  variant?: "inline" | "banner" | "compact";
  /** Additional CSS classes */
  className?: string;
}

// ─── State configs ──────────────────────────────────────────────

interface StateConfig {
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
  borderClass: string;
}

const STATE_CONFIGS: Record<Exclude<OperationState, "idle">, StateConfig> = {
  running: {
    icon: Loader2,
    iconClass: "text-primary animate-spin",
    bgClass: "bg-primary/5",
    borderClass: "border-primary/20",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/20",
    borderClass: "border-emerald-200 dark:border-emerald-800",
  },
  error: {
    icon: XCircle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/5",
    borderClass: "border-destructive/20",
  },
};

// ─── Component ──────────────────────────────────────────────────

/**
 * Visual progress indicator for long-running operations.
 *
 * Shows a progress bar with step info during running state,
 * success checkmark when done, or error with retry option.
 *
 * @example
 * ```tsx
 * const op = useAsyncOperation(async (setProgress) => {
 *   setProgress({ current: 0, total: 3, message: "Step 1..." });
 *   // ...
 * });
 *
 * <OperationProgress
 *   state={op.state}
 *   progress={op.progress}
 *   error={op.error}
 *   title="Deploying configuration"
 *   onRetry={() => op.execute()}
 * />
 * ```
 */
export function OperationProgress({
  state,
  progress,
  error,
  title,
  successMessage = "Operation completed successfully",
  onRetry,
  onDismiss,
  variant = "inline",
  className,
}: OperationProgressProps) {
  // Don't render in idle state
  if (state === "idle") return null;

  const config = STATE_CONFIGS[state];
  const Icon = config.icon;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm",
          className,
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", config.iconClass)} />
        <span className="truncate text-muted-foreground">
          {state === "running" && (progress?.message ?? title ?? "Processing...")}
          {state === "success" && (successMessage)}
          {state === "error" && (error?.message ?? "Operation failed")}
        </span>
        {state === "running" && progress && progress.total > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground/70">
            {progress.percent}%
          </span>
        )}
        {state === "error" && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-auto p-0 text-xs text-primary hover:text-primary/80"
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        config.bgClass,
        config.borderClass,
        variant === "banner" && "rounded-none border-x-0",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-0.5">
          <Icon className={cn("h-5 w-5 shrink-0", config.iconClass)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Title + message */}
          <div>
            {title && (
              <p className="text-sm font-medium leading-tight">
                {title}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {state === "running" && (progress?.message ?? "Processing...")}
              {state === "success" && successMessage}
              {state === "error" && (error?.message ?? "An error occurred")}
            </p>
          </div>

          {/* Progress bar */}
          {state === "running" && progress && progress.total > 0 && (
            <div className="space-y-1">
              <Progress value={progress.percent} className="h-1.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Step {progress.current} of {progress.total}
                </span>
                <span>{progress.percent}%</span>
              </div>
            </div>
          )}

          {/* Indeterminate progress (no step count) */}
          {state === "running" && (!progress || progress.total === 0) && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          )}

          {/* Action buttons */}
          {(state === "error" || state === "success") && (onRetry || onDismiss) && (
            <div className="flex items-center gap-2 pt-1">
              {state === "error" && onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="h-7 text-xs"
                >
                  Try Again
                </Button>
              )}
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  className="h-7 text-xs"
                >
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OperationProgress;
