"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Sparkles } from "lucide-react";
import { useAgents } from "@/hooks/queries/useAgents";

interface QuickChatBoxProps {
  onSend?: (message: string, agentId: string) => void;
  className?: string;
}

export function QuickChatBox({ onSend, className }: QuickChatBoxProps) {
  const [message, setMessage] = React.useState("");
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>("");
  const { data: agents, isLoading: agentsLoading } = useAgents();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && selectedAgentId) {
      onSend?.(message.trim(), selectedAgentId);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("group", className)}
    >
      <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        {/* Gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-accent to-primary opacity-60" />

        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Quick Chat</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Agent selector */}
            <Select
              value={selectedAgentId}
              onValueChange={setSelectedAgentId}
              disabled={agentsLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full",
                          agent.status === "online"
                            ? "bg-green-500"
                            : agent.status === "busy"
                              ? "bg-yellow-500"
                              : agent.status === "paused"
                                ? "bg-orange-500"
                                : "bg-gray-400"
                        )}
                      />
                      <span>{agent.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({agent.role})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Message input and send */}
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a quick message..."
                className="flex-1"
                disabled={!selectedAgentId}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!message.trim() || !selectedAgentId}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default QuickChatBox;
