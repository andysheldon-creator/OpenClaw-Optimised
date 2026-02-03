"use client";

import { ChevronDown, Send, MessageSquare } from "lucide-react";
import React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./agent-avatar";

const agents = [
  { id: "research", name: "Research Assistant", status: "active" as const },
  { id: "writing", name: "Writing Partner", status: "ready" as const },
  { id: "scheduler", name: "Scheduler", status: "ready" as const },
];

interface QuickChatProps {
  className?: string;
}

export function QuickChat({ className }: QuickChatProps) {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      return;
    }
    // Navigate to chat with message
    window.location.href = `/chat/${selectedAgent.id}?message=${encodeURIComponent(message)}`;
  };

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-soft", className)}>
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-medium">Quick Chat</span>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-2 rounded-xl border-border bg-muted/50 px-3 hover:bg-muted"
            >
              <AgentAvatar name={selectedAgent.name} size="sm" status={selectedAgent.status} />
              <span className="hidden sm:inline max-w-[100px] truncate">{selectedAgent.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {agents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="gap-2"
              >
                <AgentAvatar name={agent.name} size="sm" status={agent.status} />
                <span>{agent.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative flex-1">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would you like to work on today?"
            className="h-10 w-full rounded-xl border border-border bg-background px-4 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim()}
            className="absolute right-1 top-1 h-8 w-8 rounded-lg"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
