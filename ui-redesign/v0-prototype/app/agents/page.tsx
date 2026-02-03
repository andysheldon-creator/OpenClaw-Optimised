"use client";

import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  MessageSquare,
  Settings,
  MoreVertical,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppShell } from "@/components/navigation/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const agents = [
  {
    id: "research",
    name: "Research Assistant",
    status: "active" as const,
    activeTasks: 3,
    description: "Specializes in research, analysis, and data gathering",
  },
  {
    id: "writing",
    name: "Writing Partner",
    status: "ready" as const,
    description: "Helps with writing, editing, and creative content",
  },
  {
    id: "scheduler",
    name: "Scheduler",
    status: "ready" as const,
    nextEvent: "2pm",
    description: "Manages your calendar and reminders",
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    status: "paused" as const,
    description: "Reviews PRs and provides feedback",
  },
];

const statusLabel = {
  active: "Active",
  ready: "Ready",
  paused: "Paused",
};

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "status">("recent");

  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-5xl px-4 pb-24 md:px-6">
          {/* Header */}
          <div className="mb-2">
            <h1 className="text-2xl font-semibold text-foreground">Your Agents</h1>
            <p className="text-muted-foreground">Your team of AI assistants</p>
          </div>

          {/* Controls */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents..."
                className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl bg-transparent">
                    <Filter className="h-4 w-4" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>All agents</DropdownMenuItem>
                  <DropdownMenuItem>Active</DropdownMenuItem>
                  <DropdownMenuItem>Ready</DropdownMenuItem>
                  <DropdownMenuItem>Paused</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl bg-transparent">
                    <ArrowUpDown className="h-4 w-4" />
                    Sort: {sortBy === "recent" ? "Recent" : sortBy === "name" ? "Name" : "Status"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy("recent")}>Recent</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("name")}>Name</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("status")}>Status</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Create Agent */}
              <Button asChild className="gap-2 rounded-xl">
                <Link href="/agents/new">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Link>
              </Button>
            </div>
          </div>

          {/* Agent Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:border-primary/30 hover:shadow-soft-lg"
              >
                <div className="mb-4 flex items-start justify-between">
                  <AgentAvatar name={agent.name} size="lg" status={agent.status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Edit agent</DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>Pause agent</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mb-3">
                  <h3 className="font-medium text-foreground">{agent.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        agent.status === "active"
                          ? "bg-success"
                          : agent.status === "ready"
                            ? "bg-success"
                            : "bg-warning"
                      }`}
                    />
                    {statusLabel[agent.status]}
                    {agent.activeTasks && <span> · {agent.activeTasks} active tasks</span>}
                    {agent.nextEvent && <span> · Next: {agent.nextEvent}</span>}
                  </p>
                </div>

                <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                  {agent.description}
                </p>

                <div className="flex gap-2">
                  <Button asChild variant="default" size="sm" className="flex-1 gap-2 rounded-xl">
                    <Link href={`/chat/${agent.id}`}>
                      <MessageSquare className="h-4 w-4" />
                      Chat
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2 rounded-xl bg-transparent"
                  >
                    <Link href={`/agents/${agent.id}`}>
                      <Settings className="h-4 w-4" />
                      Config
                    </Link>
                  </Button>
                </div>
              </div>
            ))}

            {/* Create New Agent Card */}
            <Link
              href="/agents/new"
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-primary/40 hover:bg-accent/50"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Create New Agent</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start from a template or build from scratch
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
                Get started
              </Button>
            </Link>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
