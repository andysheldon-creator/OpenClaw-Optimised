"use client";

import { Check, Clock, AlertCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TaskStatus = "complete" | "running" | "pending" | "blocked";

interface TaskNodeProps {
  task: {
    id: string;
    name: string;
    status: TaskStatus;
    progress?: number;
  };
  selected?: boolean;
  onClick?: () => void;
}

const statusConfig: Record<
  TaskStatus,
  {
    icon: typeof Check;
    label: string;
    bgClass: string;
    borderClass: string;
    iconClass: string;
  }
> = {
  complete: {
    icon: Check,
    label: "Complete",
    bgClass: "bg-success/10",
    borderClass: "border-success/40",
    iconClass: "text-success",
  },
  running: {
    icon: Loader2,
    label: "Running",
    bgClass: "bg-info/10",
    borderClass: "border-info/40",
    iconClass: "text-info",
  },
  pending: {
    icon: Circle,
    label: "Pending",
    bgClass: "bg-muted",
    borderClass: "border-border",
    iconClass: "text-muted-foreground",
  },
  blocked: {
    icon: AlertCircle,
    label: "Blocked",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/40",
    iconClass: "text-destructive",
  },
};

export function TaskNode({ task, selected, onClick }: TaskNodeProps) {
  const config = statusConfig[task.status];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        config.bgClass,
        config.borderClass,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        "min-w-[140px] min-h-[90px]",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon
          className={cn("h-4 w-4", config.iconClass, task.status === "running" && "animate-spin")}
        />
        <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
      </div>
      <span className="text-sm font-medium text-foreground text-center line-clamp-2">
        {task.name}
      </span>
      {task.status === "running" && task.progress !== undefined && (
        <div className="mt-2 h-1.5 w-full max-w-[100px] rounded-full bg-info/20 overflow-hidden">
          <div
            className="h-full bg-info rounded-full transition-all"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
    </button>
  );
}
