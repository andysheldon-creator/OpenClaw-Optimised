"use client";

import {
  Target,
  Calendar,
  ChevronRight,
  GitBranch,
  CheckSquare,
  Clock,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface Goal {
  id: string;
  name: string;
  description: string;
  progress: number;
  targetDate?: string;
  daysRemaining?: number;
  status: "active" | "completed" | "paused";
  priority: "high" | "medium" | "low";
  workstreams: Array<{
    id: string;
    name: string;
    progress: number;
  }>;
  taskCount: number;
  milestoneCount: number;
  completedMilestones: number;
  agentName?: string;
  completedDate?: string;
}

const priorityConfig = {
  high: {
    label: "High Priority",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dotColor: "bg-destructive",
  },
  medium: {
    label: "Medium",
    className: "bg-warning/10 text-warning-foreground border-warning/20",
    dotColor: "bg-warning",
  },
  low: {
    label: "Low",
    className: "bg-muted text-muted-foreground border-border",
    dotColor: "bg-muted-foreground",
  },
};

interface GoalCardProps {
  goal: Goal;
  variant?: "default" | "compact";
}

export function GoalCard({ goal, variant = "default" }: GoalCardProps) {
  const isCompleted = goal.status === "completed";

  if (variant === "compact") {
    return (
      <Link
        href={`/goals/${goal.id}`}
        className={cn(
          "group flex items-center gap-4 rounded-lg border border-border bg-card/50 px-4 py-3 transition-all hover:bg-card hover:border-primary/30",
          isCompleted && "opacity-60",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
          <Target className="h-4 w-4 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-medium text-sm truncate", isCompleted && "line-through")}>
            {goal.name}
          </p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {goal.completedDate}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:border-primary/30 hover:shadow-soft-lg",
        isCompleted && "opacity-70",
      )}
    >
      {/* Priority indicator */}
      <div
        className={cn(
          "absolute left-0 top-6 h-8 w-1 rounded-r-full",
          priorityConfig[goal.priority].dotColor,
        )}
      />

      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3
              className={cn("font-semibold text-lg text-foreground", isCompleted && "line-through")}
            >
              {goal.name}
            </h3>
            <Badge
              variant="outline"
              className={cn("text-[10px] font-medium", priorityConfig[goal.priority].className)}
            >
              {priorityConfig[goal.priority].label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            "{goal.description}"
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Progress</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {goal.progress}%
          </span>
        </div>
        <div className="relative">
          <Progress value={goal.progress} className="h-3" />
          {goal.progress >= 80 && goal.progress < 100 && (
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-warning animate-pulse" />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground mb-4">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          <span>
            {goal.workstreams.length} workstream{goal.workstreams.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckSquare className="h-3.5 w-3.5" />
          <span>{goal.taskCount} tasks</span>
        </div>
        {goal.targetDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Target: {goal.targetDate}</span>
          </div>
        )}
        {goal.daysRemaining !== undefined && goal.daysRemaining > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span className={cn(goal.daysRemaining <= 7 && "text-warning-foreground font-medium")}>
              {goal.daysRemaining} days left
            </span>
          </div>
        )}
      </div>

      {/* Milestones preview */}
      {goal.milestoneCount > 0 && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50">
          <div className="flex -space-x-1">
            {Array.from({ length: Math.min(goal.milestoneCount, 5) }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full border-2 border-card flex items-center justify-center",
                  i < goal.completedMilestones ? "bg-success" : "bg-muted",
                )}
              >
                {i < goal.completedMilestones && (
                  <svg
                    className="h-2.5 w-2.5 text-success-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {goal.completedMilestones}/{goal.milestoneCount} milestones
          </span>
        </div>
      )}

      {/* Agent & View Details */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {goal.agentName && (
          <div className="flex items-center gap-2">
            <AgentAvatar name={goal.agentName} size="sm" />
            <span className="text-xs text-muted-foreground">{goal.agentName}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="ml-auto text-primary hover:text-primary"
        >
          <Link href={`/goals/${goal.id}`}>
            View details
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
