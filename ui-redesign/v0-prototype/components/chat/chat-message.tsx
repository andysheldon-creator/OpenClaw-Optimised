"use client";

import { User, ChevronDown, ChevronUp, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { cn } from "@/lib/utils";

interface ToolCall {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  input?: string;
  output?: string;
  duration?: string;
  progress?: number;
}

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    agentName?: string;
    agentStatus?: "active" | "ready";
    toolCalls?: ToolCall[];
    isStreaming?: boolean;
  };
  className?: string;
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start", className)}>
      {!isUser && message.agentName && (
        <AgentAvatar
          name={message.agentName}
          size="sm"
          status={message.agentStatus}
          className="mt-1 shrink-0"
        />
      )}

      <div className={cn("max-w-[85%] md:max-w-[75%] space-y-2", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border shadow-soft",
          )}
        >
          {/* Header */}
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span
              className={cn(
                "font-medium",
                isUser ? "text-primary-foreground/90" : "text-foreground",
              )}
            >
              {isUser ? "You" : message.agentName}
            </span>
            <span className={cn(isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {message.timestamp}
            </span>
          </div>

          {/* Content */}
          <div
            className={cn(
              "text-sm leading-relaxed",
              isUser ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {message.content}
            {message.isStreaming && (
              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-current" />
            )}
          </div>
        </div>

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((tool) => (
              <ToolCallCard
                key={tool.id}
                tool={tool}
                isExpanded={expandedTools.has(tool.id)}
                onToggle={() => toggleToolExpand(tool.id)}
              />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

interface ToolCallCardProps {
  tool: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolCallCard({ tool, isExpanded, onToggle }: ToolCallCardProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {tool.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : tool.status === "done" ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <span className="h-4 w-4 text-destructive">!</span>
            )}
          </span>
          <span className="text-sm font-medium text-foreground">{tool.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {tool.status === "running" ? "Running" : tool.status === "done" ? "Done" : "Error"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Progress bar for running tools */}
      {tool.status === "running" && tool.progress !== undefined && (
        <div className="px-3 pb-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${tool.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3">
          {tool.input && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Input
              </p>
              <pre className="rounded-lg bg-background p-2 text-xs overflow-x-auto">
                {tool.input}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Output
              </p>
              <pre className="rounded-lg bg-background p-2 text-xs overflow-x-auto max-h-32">
                {tool.output}
              </pre>
            </div>
          )}
          {tool.duration && (
            <p className="text-xs text-muted-foreground">Duration: {tool.duration}</p>
          )}
        </div>
      )}
    </div>
  );
}
