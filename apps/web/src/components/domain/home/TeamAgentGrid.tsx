"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/domain/agents";
import { useAgents } from "@/hooks/queries/useAgents";
import { Users, ArrowRight, Loader2 } from "lucide-react";

interface TeamAgentGridProps {
  maxAgents?: number;
  onChatWithAgent?: (agentId: string) => void;
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function TeamAgentGrid({
  maxAgents = 6,
  onChatWithAgent,
  className,
}: TeamAgentGridProps) {
  const { data: agents, isLoading, error } = useAgents();

  // Sort by last active and take top N agents
  const displayAgents = React.useMemo(() => {
    if (!agents) {return [];}
    return [...agents]
      .toSorted((a, b) => {
        // Prioritize online/busy agents
        const statusOrder = { online: 0, busy: 1, paused: 2, offline: 3 };
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) {return statusDiff;}
        // Then by last active
        const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
        const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, maxAgents);
  }, [agents, maxAgents]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("", className)}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg">Team Agents</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/agents">
              View All
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Failed to load agents
            </div>
          ) : displayAgents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No agents available
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {displayAgents.map((agent) => (
                <motion.div key={agent.id} variants={itemVariants}>
                  <AgentCard
                    agent={agent}
                    variant="compact"
                    onChat={() => onChatWithAgent?.(agent.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default TeamAgentGrid;
