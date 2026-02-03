"use client";

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface WorkstreamCardProps {
  workstream: {
    id: string;
    name: string;
    progress: number;
    totalTasks: number;
    inProgressTasks: number;
    blockedTasks?: number;
    agentName: string;
  };
  className?: string;
}

export function WorkstreamCard({ workstream, className }: WorkstreamCardProps) {
  return (
    <Link
      href={`/workstreams/${workstream.id}`}
      className={cn(
        "group block rounded-xl border border-border bg-card p-4 shadow-soft transition-all hover:border-primary/30 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
              {workstream.name}
            </h3>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {workstream.progress}%
            </span>
          </div>
          <Progress value={workstream.progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {workstream.totalTasks} tasks · {workstream.inProgressTasks} in progress
            {workstream.blockedTasks && workstream.blockedTasks > 0 && (
              <span className="text-warning"> · {workstream.blockedTasks} blocked</span>
            )}
            <span className="text-muted-foreground/60"> · {workstream.agentName}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
