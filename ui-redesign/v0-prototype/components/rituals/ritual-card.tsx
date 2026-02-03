"use client";

import { RefreshCw, SkipForward, Pencil, Play, Pause, Clock } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RitualStatus = "upcoming" | "paused" | "completed";

interface RitualCardProps {
  name: string;
  agentName: string;
  agentColor?: string;
  prompt: string;
  time: string;
  status: RitualStatus;
  onSkip?: () => void;
  onEdit?: () => void;
  onResume?: () => void;
  onPause?: () => void;
  className?: string;
}

export function RitualCard({
  name,
  agentName,
  agentColor = "#e07a5f",
  prompt,
  time,
  status,
  onSkip,
  onEdit,
  onResume,
  onPause,
  className,
}: RitualCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-4 shadow-soft transition-all hover:shadow-soft-lg",
        status === "paused" && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <RefreshCw className="size-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium text-foreground">{name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <AgentAvatar name={agentName} color={agentColor} size="xs" />
                <span className="text-sm text-muted-foreground">{agentName}</span>
              </div>
            </div>

            {/* Time / Status */}
            <div className="shrink-0 text-right">
              {status === "paused" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  <Pause className="size-3" />
                  Paused
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-3.5" />
                  {time}
                </span>
              )}
            </div>
          </div>

          {/* Prompt */}
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{`"${prompt}"`}</p>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            {status === "upcoming" && onSkip && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="h-8 text-muted-foreground hover:text-foreground"
              >
                <SkipForward className="mr-1.5 size-4" />
                Skip
              </Button>
            )}
            {status === "paused" && onResume && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResume}
                className="h-8 text-muted-foreground hover:text-foreground"
              >
                <Play className="mr-1.5 size-4" />
                Resume
              </Button>
            )}
            {status !== "paused" && onPause && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPause}
                className="h-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pause className="mr-1.5 size-4" />
                Pause
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="mr-1.5 size-4" />
              Edit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
