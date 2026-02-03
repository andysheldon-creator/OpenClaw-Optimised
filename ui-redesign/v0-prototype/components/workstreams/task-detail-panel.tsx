"use client";

import { X, Check, Circle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "./task-node";

interface Subtask {
  id: string;
  name: string;
  status: "complete" | "in_progress" | "pending";
}

interface TaskDetailPanelProps {
  task: {
    id: string;
    name: string;
    status: TaskStatus;
    progress?: number;
    startedAt?: string;
    description: string;
    dependencies: { id: string; name: string; status: TaskStatus }[];
    blocks: { id: string; name: string; status: TaskStatus }[];
    subtasks: Subtask[];
  };
  onClose: () => void;
  onEdit?: () => void;
  onPause?: () => void;
  onDelete?: () => void;
}

const statusConfig: Record<TaskStatus, { icon: typeof Check; label: string; className: string }> = {
  complete: { icon: Check, label: "Complete", className: "text-success" },
  running: { icon: Loader2, label: "In Progress", className: "text-info" },
  pending: { icon: Circle, label: "Pending", className: "text-muted-foreground" },
  blocked: { icon: AlertCircle, label: "Blocked", className: "text-destructive" },
};

export function TaskDetailPanel({
  task,
  onClose,
  onEdit,
  onPause,
  onDelete,
}: TaskDetailPanelProps) {
  const StatusIcon = statusConfig[task.status].icon;

  return (
    <div className="w-80 border-l border-border bg-card h-full overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card p-4">
        <h2 className="font-semibold text-foreground truncate pr-2">{task.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Status */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </h3>
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <StatusIcon
                className={cn(
                  "h-4 w-4",
                  statusConfig[task.status].className,
                  task.status === "running" && "animate-spin",
                )}
              />
              <span className="font-medium text-sm">{statusConfig[task.status].label}</span>
            </div>
            {task.startedAt && (
              <p className="text-xs text-muted-foreground">Started {task.startedAt}</p>
            )}
            {task.status === "running" && task.progress !== undefined && (
              <div className="flex items-center gap-2">
                <Progress value={task.progress} className="h-2 flex-1" />
                <span className="text-xs font-medium tabular-nums">{task.progress}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Description
          </h3>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm text-foreground">{task.description}</p>
          </div>
        </div>

        {/* Dependencies */}
        {task.dependencies.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dependencies
            </h3>
            <div className="space-y-1">
              {task.dependencies.map((dep) => {
                const DepIcon = statusConfig[dep.status].icon;
                return (
                  <div key={dep.id} className="flex items-center gap-2 text-sm">
                    <DepIcon className={cn("h-3.5 w-3.5", statusConfig[dep.status].className)} />
                    <span>{dep.name}</span>
                    <span className="text-xs text-muted-foreground">({dep.status})</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Blocks */}
        {task.blocks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Blocks
            </h3>
            <div className="space-y-1">
              {task.blocks.map((block) => {
                const BlockIcon = statusConfig[block.status].icon;
                return (
                  <div key={block.id} className="flex items-center gap-2 text-sm">
                    <BlockIcon
                      className={cn("h-3.5 w-3.5", statusConfig[block.status].className)}
                    />
                    <span>{block.name}</span>
                    <span className="text-xs text-muted-foreground">({block.status})</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subtasks */}
        {task.subtasks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Subtasks
            </h3>
            <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
              {task.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2 text-sm">
                  {subtask.status === "complete" && <Check className="h-3.5 w-3.5 text-success" />}
                  {subtask.status === "in_progress" && (
                    <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
                  )}
                  {subtask.status === "pending" && (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      subtask.status === "complete" && "line-through text-muted-foreground",
                    )}
                  >
                    {subtask.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit Task
          </Button>
          <Button variant="outline" size="sm" onClick={onPause}>
            {task.status === "running" ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive bg-transparent"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
