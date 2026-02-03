"use client";

import { RefreshCw, Lightbulb, FileText, Target } from "lucide-react";
import { AgentCard } from "@/components/dashboard/agent-card";
import { MetricCard, MetricItem } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { QuickChat } from "@/components/dashboard/quick-chat";
import { SectionHeader } from "@/components/dashboard/section-header";
import { WorkstreamCard } from "@/components/dashboard/workstream-card";
import { AppShell } from "@/components/navigation/app-shell";

// Mock data
const agents = [
  {
    id: "research",
    name: "Research Assistant",
    status: "active" as const,
    activeTasks: 3,
  },
  {
    id: "writing",
    name: "Writing Partner",
    status: "ready" as const,
  },
  {
    id: "scheduler",
    name: "Scheduler",
    status: "ready" as const,
    nextEvent: "2pm",
  },
];

const workstreams = [
  {
    id: "q1-launch",
    name: "Q1 Launch Prep",
    progress: 78,
    totalTasks: 12,
    inProgressTasks: 3,
    agentName: "Research Assistant",
  },
  {
    id: "content-calendar",
    name: "Content Calendar",
    progress: 60,
    totalTasks: 8,
    inProgressTasks: 2,
    blockedTasks: 1,
    agentName: "Writing Partner",
  },
];

const rituals = [
  { label: "Daily Standup", value: "in 2h" },
  { label: "Weekly Review", value: "Mon 9am" },
  { label: "End of Day Summary", value: "6pm" },
];

const insights = [
  { label: 'You mention "deadline" more on Mondays' },
  { label: "Your writing is more detailed in afternoons" },
];

const memories = [
  { label: "Prefers bullet points" },
  { label: "Project deadline: Feb 1" },
  { label: "Key stakeholder: Jamie" },
];

const goals = [
  { label: "Launch Podcast", progress: 65 },
  { label: "Improve Response", progress: 40 },
  { label: "Q1 Revenue", progress: 80 },
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
          {/* Quick Chat */}
          <QuickChat className="mb-8" />

          {/* Your Team */}
          <section className="mb-8">
            <SectionHeader title="Your Team" href="/agents" className="mb-4" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
              <AgentCard isCreateNew />
            </div>
          </section>

          {/* Active Workstreams */}
          <section className="mb-8">
            <SectionHeader title="Active Workstreams" href="/workstreams" className="mb-4" />
            <div className="space-y-3">
              {workstreams.map((workstream) => (
                <WorkstreamCard key={workstream.id} workstream={workstream} />
              ))}
            </div>
          </section>

          {/* Dashboard Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Upcoming Rituals */}
            <MetricCard
              title="Upcoming Rituals"
              href="/rituals"
              addHref="/rituals/new"
              addLabel="New ritual"
            >
              {rituals.map((ritual) => (
                <MetricItem
                  key={ritual.label}
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  label={ritual.label}
                  value={ritual.value}
                />
              ))}
            </MetricCard>

            {/* Recent Insights */}
            <MetricCard title="Recent Insights" href="/insights">
              {insights.map((insight) => (
                <MetricItem
                  key={insight.label}
                  icon={<Lightbulb className="h-3.5 w-3.5" />}
                  label={insight.label}
                />
              ))}
            </MetricCard>

            {/* Recent Memories */}
            <MetricCard title="Recent Memories" href="/memories">
              {memories.map((memory) => (
                <MetricItem
                  key={memory.label}
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label={memory.label}
                />
              ))}
            </MetricCard>

            {/* Goal Progress */}
            <MetricCard title="Goal Progress" href="/goals">
              {goals.map((goal) => (
                <MetricItem
                  key={goal.label}
                  icon={<Target className="h-3.5 w-3.5" />}
                  label={goal.label}
                  progress={goal.progress}
                />
              ))}
            </MetricCard>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
