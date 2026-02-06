"use client";

import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MetricCard } from "@/components/composed/MetricCard";
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  Zap,
  Layers,
  Calendar,
} from "lucide-react";
import type { Agent } from "@/hooks/queries/useAgents";
import type { Workstream } from "@/hooks/queries/useWorkstreams";
import type { Ritual } from "@/hooks/queries/useRituals";

interface AgentOverviewTabProps {
  agent: Agent;
  workstreams?: Workstream[];
  rituals?: Ritual[];
}

export function AgentOverviewTab({
  agent,
  workstreams = [],
  rituals = [],
}: AgentOverviewTabProps) {
  // Mock stats for now
  const stats = {
    conversations: 42,
    messages: 1284,
    tasksCompleted: 156,
  };
  const configEvalSuggestions = [
    {
      id: "ambiguity",
      label: "Flag ambiguous directives that could confuse intent.",
      fileLabel: "AGENTS.md",
    },
    {
      id: "missing-intent",
      label: "Surface missing intent behind tool and policy choices.",
      fileLabel: "TOOLS.md",
    },
    {
      id: "risky-settings",
      label: "Highlight risky settings before they ship.",
      fileLabel: "SOUL.md",
    },
  ] as const;

  const activeWorkstreams = workstreams.filter((w) => w.status === "active");
  const upcomingRituals = rituals
    .filter((r) => r.status === "active" && r.nextRun)
    .toSorted((a, b) => {
      const dateA = a.nextRun ? new Date(a.nextRun).getTime() : 0;
      const dateB = b.nextRun ? new Date(b.nextRun).getTime() : 0;
      return dateA - dateB;
    })
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Conversations"
          value={stats.conversations}
          icon={<MessageSquare className="h-5 w-5" />}
          change={{ value: 12, trend: "up" }}
        />
        <MetricCard
          label="Messages Sent"
          value={stats.messages.toLocaleString()}
          icon={<Zap className="h-5 w-5" />}
          change={{ value: 8, trend: "up" }}
        />
        <MetricCard
          label="Tasks Completed"
          value={stats.tasksCompleted}
          icon={<CheckCircle2 className="h-5 w-5" />}
          change={{ value: 5, trend: "up" }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Workstreams */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              Active Workstreams
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeWorkstreams.length > 0 ? (
              activeWorkstreams.slice(0, 3).map((workstream) => (
                <motion.div
                  key={workstream.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border/50 bg-card/50 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{workstream.name}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {workstream.progress}%
                    </Badge>
                  </div>
                  <Progress value={workstream.progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {workstream.tasks.filter((t) => t.status === "done").length}/
                    {workstream.tasks.length} tasks completed
                  </p>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No active workstreams assigned
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Rituals */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" />
              Upcoming Rituals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingRituals.length > 0 ? (
              upcomingRituals.map((ritual) => (
                <motion.div
                  key={ritual.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3"
                >
                  <div>
                    <h4 className="font-medium text-sm">{ritual.name}</h4>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {ritual.nextRun
                          ? formatRelativeTime(new Date(ritual.nextRun))
                          : "Not scheduled"}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      ritual.frequency === "daily" && "border-green-500/50 text-green-500",
                      ritual.frequency === "weekly" && "border-blue-500/50 text-blue-500",
                      ritual.frequency === "hourly" && "border-orange-500/50 text-orange-500"
                    )}
                  >
                    {ritual.frequency}
                  </Badge>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No upcoming rituals scheduled
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Personality Summary */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personality Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Communication</span>
                <span className="font-medium">Balanced</span>
              </div>
              <Progress value={50} className="h-1.5" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Detail Level</span>
                <span className="font-medium">Detailed</span>
              </div>
              <Progress value={70} className="h-1.5" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tone</span>
                <span className="font-medium">Professional</span>
              </div>
              <Progress value={30} className="h-1.5" />
            </div>
          </div>

          {agent.tags && agent.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground mb-2">Core Traits</p>
              <div className="flex flex-wrap gap-2">
                {agent.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Config Eval (Coming Soon)</CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Preview
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Future diagnostics will scan for ambiguity, missing intent, and risky settings
            before configs go live.
          </p>
          <div className="space-y-2">
            {configEvalSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">{suggestion.label}</span>
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: agent.id }}
                  search={{ tab: "files" }}
                  className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                >
                  {suggestion.fileLabel}
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs < 0) {return "Overdue";}
  if (diffHours < 1) {return "Less than an hour";}
  if (diffHours < 24) {return `In ${diffHours} hour${diffHours === 1 ? "" : "s"}`;}
  if (diffDays < 7) {return `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;}
  return date.toLocaleDateString();
}

export default AgentOverviewTab;
