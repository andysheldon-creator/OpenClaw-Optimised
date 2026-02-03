"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./agent-avatar";

interface AgentCardProps {
  agent?: {
    id: string;
    name: string;
    status: "active" | "ready" | "paused";
    activeTasks?: number;
    nextEvent?: string;
  };
  isCreateNew?: boolean;
  className?: string;
}

export function AgentCard({ agent, isCreateNew, className }: AgentCardProps) {
  if (isCreateNew) {
    return (
      <Link
        href="/agents/new"
        className={cn(
          "group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <Plus className="h-6 w-6" />
        </div>
        <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          New Agent
        </span>
      </Link>
    );
  }

  if (!agent) {
    return null;
  }

  const statusLabel = {
    active: "Active",
    ready: "Ready",
    paused: "Paused",
  };

  return (
    <Link
      href={`/chat/${agent.id}`}
      className={cn(
        "group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-soft transition-all hover:border-primary/30 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <AgentAvatar name={agent.name} size="lg" status={agent.status} />
      <div className="space-y-1">
        <h3 className="font-medium text-foreground">{agent.name}</h3>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              agent.status === "active" && "bg-success",
              agent.status === "ready" && "bg-success",
              agent.status === "paused" && "bg-warning",
            )}
          />
          {statusLabel[agent.status]}
          {agent.activeTasks && agent.activeTasks > 0 && (
            <span className="text-muted-foreground/80">
              {" "}
              · {agent.activeTasks} {agent.activeTasks === 1 ? "task" : "tasks"}
            </span>
          )}
          {agent.nextEvent && (
            <span className="text-muted-foreground/80"> · Next: {agent.nextEvent}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
