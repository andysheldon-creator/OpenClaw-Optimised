"use client";

import { Plus, Target, Calendar, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import { AppShell } from "@/components/navigation/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Mock data
const activeGoals = [
  {
    id: "1",
    name: "Complete Q1 research analysis",
    description: "Finish the comprehensive market research analysis for Q1 planning",
    progress: 65,
    dueDate: "Feb 15",
    agentName: "Research Assistant",
    workstreamId: "q1-launch",
    workstreamName: "Q1 Launch Prep",
    priority: "high" as const,
  },
  {
    id: "2",
    name: "Write blog post series",
    description: "Create a 5-part blog post series on AI productivity",
    progress: 40,
    dueDate: "Feb 28",
    agentName: "Writing Partner",
    priority: "medium" as const,
  },
  {
    id: "3",
    name: "Establish weekly review ritual",
    description: "Set up and maintain a consistent weekly review process",
    progress: 80,
    dueDate: "Ongoing",
    agentName: "All Agents",
    priority: "low" as const,
  },
];

const completedGoals = [
  {
    id: "4",
    name: "Set up Second Brain workspace",
    description: "Configure agents and initial workflows",
    progress: 100,
    dueDate: "Completed Jan 10",
    agentName: "All Agents",
    priority: "high" as const,
  },
];

const priorityConfig = {
  high: { label: "High", className: "bg-destructive/10 text-destructive" },
  medium: { label: "Medium", className: "bg-warning/10 text-warning-foreground" },
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
};

interface GoalCardProps {
  goal: (typeof activeGoals)[0];
  completed?: boolean;
}

function GoalCard({ goal, completed }: GoalCardProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-4 shadow-soft transition-all hover:border-primary/30 hover:shadow-soft-lg",
        completed && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("font-medium text-foreground", completed && "line-through")}>
              {goal.name}
            </h3>
            <Badge
              variant="secondary"
              className={cn("text-[10px]", priorityConfig[goal.priority].className)}
            >
              {priorityConfig[goal.priority].label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <Progress value={goal.progress} className="h-2 flex-1" />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {goal.progress}%
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {goal.dueDate}
          </div>
          <span>{goal.agentName}</span>
        </div>
        {goal.workstreamId && (
          <Link
            href={`/workstreams/${goal.workstreamId}`}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            {goal.workstreamName}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-4xl px-4 pb-24 md:px-6">
          {/* Page Title */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Goals</h1>
              <p className="mt-1 text-muted-foreground">
                Track objectives across your agents and workstreams
              </p>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Goal
            </Button>
          </div>

          {/* Active Goals */}
          <section className="mb-10">
            <SectionHeader title="Active" count={activeGoals.length} />
            <div className="space-y-3">
              {activeGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          </section>

          {/* Completed Goals */}
          <section>
            <SectionHeader title="Completed" count={completedGoals.length} />
            <div className="space-y-3">
              {completedGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} completed />
              ))}
            </div>
          </section>
        </main>

        {/* Create Goal Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="goal-name">Goal Name</Label>
                <Input id="goal-name" placeholder="Complete Q1 research analysis" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-description">Description</Label>
                <Textarea
                  id="goal-description"
                  placeholder="Describe what you want to achieve..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select defaultValue="medium">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assign to Agent</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="research">Research Assistant</SelectItem>
                    <SelectItem value="writing">Writing Partner</SelectItem>
                    <SelectItem value="scheduler">Scheduler</SelectItem>
                    <SelectItem value="all">All Agents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsCreateOpen(false)}>Create Goal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
