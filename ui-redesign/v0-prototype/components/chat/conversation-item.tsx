"use client";

import Link from "next/link";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { cn } from "@/lib/utils";

interface ConversationItemProps {
  conversation: {
    id: string;
    agentId: string;
    agentName: string;
    agentStatus: "active" | "ready" | "paused";
    lastMessage: string;
    timestamp: string;
    isActive?: boolean;
  };
  className?: string;
}

export function ConversationItem({ conversation, className }: ConversationItemProps) {
  return (
    <Link
      href={`/chat/${conversation.agentId}/${conversation.id}`}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <AgentAvatar name={conversation.agentName} status={conversation.agentStatus} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {conversation.agentName}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {conversation.isActive && (
              <span className="flex items-center gap-1 text-xs text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Active
              </span>
            )}
            <span className="text-xs text-muted-foreground">{conversation.timestamp}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
      </div>
    </Link>
  );
}
