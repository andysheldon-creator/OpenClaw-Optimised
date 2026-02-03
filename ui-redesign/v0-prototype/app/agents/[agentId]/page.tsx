"use client";

import {
  ArrowLeft,
  MessageSquare,
  Settings,
  RefreshCw,
  Target,
  Activity,
  Wrench,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { MetricCard, MetricItem } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppShell } from "@/components/navigation/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const agentsData: Record<
  string,
  {
    name: string;
    status: "active" | "ready" | "paused";
    description: string;
    createdAt: string;
    lastActive: string;
    conversations: number;
    messages: number;
    tasksCompleted: number;
    avgResponse: string;
    style: { formal: number; concise: number; playful: number };
    values: string[];
    background: string;
  }
> = {
  research: {
    name: "Research Assistant",
    status: "active",
    description: "Helps with research, analysis, and data gathering",
    createdAt: "2 weeks ago",
    lastActive: "5 minutes ago",
    conversations: 47,
    messages: 1234,
    tasksCompleted: 89,
    avgResponse: "2.3s",
    style: { formal: 70, concise: 40, playful: 30 },
    values: ["Accuracy", "Thoroughness", "Clarity"],
    background:
      "You are a research assistant specializing in market analysis and competitive intelligence. You have a background in data science and business strategy.",
  },
  writing: {
    name: "Writing Partner",
    status: "ready",
    description: "Helps with writing, editing, and creative content",
    createdAt: "1 month ago",
    lastActive: "2 hours ago",
    conversations: 32,
    messages: 856,
    tasksCompleted: 67,
    avgResponse: "1.8s",
    style: { formal: 40, concise: 60, playful: 70 },
    values: ["Creativity", "Clarity", "Empathy"],
    background:
      "You are a writing partner who helps craft compelling content. You excel at adapting tone and style to different audiences.",
  },
  scheduler: {
    name: "Scheduler",
    status: "ready",
    description: "Manages your calendar and reminders",
    createdAt: "3 weeks ago",
    lastActive: "1 hour ago",
    conversations: 28,
    messages: 412,
    tasksCompleted: 156,
    avgResponse: "0.9s",
    style: { formal: 50, concise: 80, playful: 20 },
    values: ["Efficiency", "Clarity", "Punctuality"],
    background:
      "You are a scheduling assistant focused on optimizing time management and ensuring no important events are missed.",
  },
};

const workstreams = [
  { name: "Q1 Launch Prep", progress: 78, tasks: 12, completed: 9, inProgress: 3 },
  { name: "Content Calendar", progress: 60, tasks: 8, completed: 5, inProgress: 2, blocked: 1 },
];

const rituals = [
  { label: "Daily Standup", value: "in 2h" },
  { label: "Weekly Review", value: "Mon 9am" },
];

const tools = [
  { name: "Web Search", enabled: true, description: "Search the internet" },
  { name: "Read Documents", enabled: true, description: "Parse PDFs, docs, spreadsheets" },
  { name: "Write Files", enabled: true, description: "Create and edit documents" },
  { name: "Code Execution", enabled: false, description: "Run code in sandbox" },
  { name: "Calendar Access", enabled: false, description: "View and modify calendar" },
  { name: "Email", enabled: false, description: "Send and read emails" },
];

const recentActivity = [
  { action: 'Completed "Competitor Analysis" task', time: "2h ago" },
  { action: "Started conversation with you", time: "2h ago" },
  { action: 'Completed "Market Research" workstream', time: "Yesterday" },
];

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const agent = agentsData[agentId] || agentsData.research;

  const [activeTab, setActiveTab] = useState("overview");
  const [toolsState, setToolsState] = useState(tools);

  const toggleTool = (toolName: string) => {
    setToolsState((prev) =>
      prev.map((tool) => (tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool)),
    );
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-5xl px-4 pb-24 md:px-6">
          {/* Back link and actions */}
          <div className="mb-6 flex items-center justify-between">
            <Button variant="ghost" asChild className="gap-2 -ml-2">
              <Link href="/agents">
                <ArrowLeft className="h-4 w-4" />
                Agents
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button asChild className="gap-2 rounded-xl">
                <Link href={`/chat/${agentId}`}>
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </Link>
              </Button>
              <Button variant="outline" className="gap-2 rounded-xl bg-transparent">
                <Settings className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>

          {/* Agent Header */}
          <div className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-6">
              <AgentAvatar name={agent.name} size="lg" status={agent.status} />
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  <h1 className="text-2xl font-semibold text-foreground">{agent.name}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      agent.status === "active"
                        ? "bg-success/10 text-success"
                        : agent.status === "ready"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {agent.status === "active"
                      ? "Active"
                      : agent.status === "ready"
                        ? "Ready"
                        : "Paused"}
                  </span>
                </div>
                <p className="text-muted-foreground mb-2">{agent.description}</p>
                <p className="text-xs text-muted-foreground">
                  Created {agent.createdAt} · Last active {agent.lastActive}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 w-full justify-start rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="overview" className="rounded-lg">
                Overview
              </TabsTrigger>
              <TabsTrigger value="workstreams" className="rounded-lg">
                Workstreams
              </TabsTrigger>
              <TabsTrigger value="rituals" className="rounded-lg">
                Rituals
              </TabsTrigger>
              <TabsTrigger value="tools" className="rounded-lg">
                Tools
              </TabsTrigger>
              <TabsTrigger value="soul" className="rounded-lg">
                Soul
              </TabsTrigger>
              <TabsTrigger value="activity" className="rounded-lg">
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Active Workstreams */}
                <MetricCard title="Active Workstreams" href={`/agents/${agentId}?tab=workstreams`}>
                  {workstreams.slice(0, 2).map((ws) => (
                    <MetricItem
                      key={ws.name}
                      icon={<Target className="h-3.5 w-3.5" />}
                      label={ws.name}
                      progress={ws.progress}
                    />
                  ))}
                </MetricCard>

                {/* Upcoming Rituals */}
                <MetricCard title="Upcoming Rituals" href={`/agents/${agentId}?tab=rituals`}>
                  {rituals.map((ritual) => (
                    <MetricItem
                      key={ritual.label}
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      label={ritual.label}
                      value={ritual.value}
                    />
                  ))}
                </MetricCard>

                {/* Quick Stats */}
                <MetricCard title="Quick Stats">
                  <MetricItem label="Conversations" value={agent.conversations.toString()} />
                  <MetricItem label="Messages" value={agent.messages.toLocaleString()} />
                  <MetricItem label="Tasks completed" value={agent.tasksCompleted.toString()} />
                  <MetricItem label="Avg response" value={agent.avgResponse} />
                </MetricCard>

                {/* Personality Summary */}
                <MetricCard title="Personality Summary" href={`/agents/${agentId}?tab=soul`}>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">Style:</span>{" "}
                      <span className="text-foreground">
                        {agent.style.formal > 50 ? "Formal" : "Casual"},{" "}
                        {agent.style.concise > 50 ? "Concise" : "Detailed"}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Values:</span>{" "}
                      <span className="text-foreground">{agent.values.join(", ")}</span>
                    </p>
                  </div>
                </MetricCard>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {recentActivity.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{item.action}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Workstreams Tab */}
            <TabsContent value="workstreams" className="space-y-4">
              {workstreams.map((ws) => (
                <div
                  key={ws.name}
                  className="rounded-xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-foreground">{ws.name}</h3>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {ws.progress}%
                    </span>
                  </div>
                  <Progress value={ws.progress} className="h-2 mb-3" />
                  <p className="text-xs text-muted-foreground">
                    {ws.tasks} tasks · {ws.completed} complete · {ws.inProgress} in progress
                    {ws.blocked && <span className="text-warning"> · {ws.blocked} blocked</span>}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg bg-transparent">
                      View DAG
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-lg">
                      Pause
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full rounded-xl bg-transparent">
                + Create Workstream
              </Button>
            </TabsContent>

            {/* Tools Tab */}
            <TabsContent value="tools" className="space-y-4">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {toolsState.map((tool, i) => (
                  <div
                    key={tool.name}
                    className={`flex items-center justify-between p-4 ${
                      i !== toolsState.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">{tool.name}</p>
                        <p className="text-xs text-muted-foreground">{tool.description}</p>
                      </div>
                    </div>
                    <Switch checked={tool.enabled} onCheckedChange={() => toggleTool(tool.name)} />
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full rounded-xl bg-transparent">
                + Add integration
              </Button>
            </TabsContent>

            {/* Soul Tab */}
            <TabsContent value="soul" className="space-y-6">
              {/* Communication Style */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Communication Style
                </h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Formal</span>
                      <span className="text-muted-foreground">Casual</span>
                    </div>
                    <Slider defaultValue={[agent.style.formal]} max={100} step={1} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Concise</span>
                      <span className="text-muted-foreground">Detailed</span>
                    </div>
                    <Slider defaultValue={[agent.style.concise]} max={100} step={1} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Serious</span>
                      <span className="text-muted-foreground">Playful</span>
                    </div>
                    <Slider defaultValue={[agent.style.playful]} max={100} step={1} />
                  </div>
                </div>
              </div>

              {/* Core Values */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Core Values
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {agent.values.map((value) => (
                    <span
                      key={value}
                      className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      {value}
                    </span>
                  ))}
                  <button className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                    + Add
                  </button>
                </div>
              </div>

              {/* Background & Context */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Background & Context
                </h3>
                <textarea
                  defaultValue={agent.background}
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={4}
                />
              </div>

              <Button className="w-full rounded-xl">
                <Sparkles className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
                {recentActivity.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-3 ${
                      i !== recentActivity.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                      <span className="text-sm text-foreground">{item.action}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Rituals Tab */}
            <TabsContent value="rituals" className="space-y-4">
              {rituals.map((ritual) => (
                <div
                  key={ritual.label}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{ritual.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{ritual.value}</span>
                </div>
              ))}
              <Button variant="outline" className="w-full rounded-xl bg-transparent">
                + New Ritual
              </Button>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </AppShell>
  );
}
