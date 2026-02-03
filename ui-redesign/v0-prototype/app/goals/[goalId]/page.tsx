"use client";

import {
  Target,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  GitBranch,
  CheckSquare,
  Plus,
  Check,
  Circle,
  Loader2,
  ChevronRight,
  Link as LinkIcon,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";

// Mock data for the goal
const goalData = {
  id: "1",
  name: "Launch Podcast",
  description: "Launch my first podcast episode by end of Q1",
  progress: 65,
  targetDate: "March 31, 2025",
  daysRemaining: 62,
  status: "active" as const,
  priority: "high" as const,
  agentName: "Research Assistant",
  createdAt: "January 5, 2025",
  milestones: [
    { id: "m1", name: "Define podcast concept", status: "completed", completedDate: "Jan 10" },
    { id: "m2", name: "Set up recording equipment", status: "completed", completedDate: "Jan 20" },
    { id: "m3", name: "Record first episode", status: "in_progress", targetDate: "Feb 15" },
    { id: "m4", name: "Edit and produce episode", status: "pending", targetDate: "Feb 28" },
    { id: "m5", name: "Launch on platforms", status: "pending", targetDate: "Mar 31" },
  ],
  workstreams: [
    {
      id: "ws1",
      name: "Content Planning",
      progress: 75,
      agentName: "Research Assistant",
      taskCount: 8,
    },
    {
      id: "ws2",
      name: "Technical Setup",
      progress: 100,
      agentName: "Writing Partner",
      taskCount: 4,
    },
  ],
};

const priorityConfig = {
  high: {
    label: "High Priority",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  medium: {
    label: "Medium",
    className: "bg-warning/10 text-warning-foreground border-warning/20",
  },
  low: {
    label: "Low",
    className: "bg-muted text-muted-foreground border-border",
  },
};

const milestoneStatusConfig = {
  completed: {
    icon: Check,
    className: "bg-success text-success-foreground",
    lineClass: "bg-success",
  },
  in_progress: {
    icon: Loader2,
    className: "bg-primary text-primary-foreground animate-pulse",
    lineClass: "bg-primary",
  },
  pending: {
    icon: Circle,
    className: "bg-muted text-muted-foreground",
    lineClass: "bg-muted",
  },
};

// Available workstreams to link
const availableWorkstreams = [
  { id: "ws3", name: "Marketing Strategy", agentName: "Research Assistant" },
  { id: "ws4", name: "Social Media Plan", agentName: "Writing Partner" },
];

export default function GoalDetailPage() {
  const params = useParams();
  const [isLinkWorkstreamOpen, setIsLinkWorkstreamOpen] = useState(false);
  const [goal] = useState(goalData);

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-4xl px-4 pb-24 md:px-6">
          {/* Back link & actions */}
          <div className="mb-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/goals">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Goals
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    Mark as Complete
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Clock className="mr-2 h-4 w-4" />
                    Pause Goal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Goal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Goal Hero Card */}
          <div className="relative rounded-2xl border border-border bg-card p-6 shadow-soft mb-8">
            {/* Priority indicator */}
            <div className="absolute left-0 top-8 h-10 w-1 rounded-r-full bg-destructive" />

            <div className="flex items-start gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 flex-shrink-0">
                <Target className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h1 className="text-2xl font-semibold text-foreground">{goal.name}</h1>
                  <Badge
                    variant="outline"
                    className={cn("text-xs font-medium", priorityConfig[goal.priority].className)}
                  >
                    {priorityConfig[goal.priority].label}
                  </Badge>
                </div>
                <p className="text-muted-foreground leading-relaxed">"{goal.description}"</p>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Overall Progress</span>
                <div className="flex items-center gap-2">
                  {goal.progress >= 80 && goal.progress < 100 && (
                    <Sparkles className="h-4 w-4 text-warning animate-pulse" />
                  )}
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {goal.progress}%
                  </span>
                </div>
              </div>
              <Progress value={goal.progress} className="h-4" />
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Target: {goal.targetDate}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning-foreground font-medium">
                  {goal.daysRemaining} days left
                </span>
              </div>
              <div className="flex items-center gap-2">
                <AgentAvatar name={goal.agentName} size="sm" />
                <span>{goal.agentName}</span>
              </div>
            </div>
          </div>

          {/* Milestones */}
          <section className="mb-10">
            <SectionHeader title="Milestones" count={goal.milestones.length} className="mb-4" />
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {goal.milestones.map((milestone, index) => {
                const config =
                  milestoneStatusConfig[milestone.status as keyof typeof milestoneStatusConfig];
                const Icon = config.icon;
                const isLast = index === goal.milestones.length - 1;

                return (
                  <div
                    key={milestone.id}
                    className={cn(
                      "relative flex items-start gap-4 p-4",
                      !isLast && "border-b border-border",
                    )}
                  >
                    {/* Timeline connector */}
                    {!isLast && (
                      <div
                        className={cn(
                          "absolute left-[1.875rem] top-12 h-[calc(100%-2rem)] w-0.5",
                          config.lineClass,
                        )}
                      />
                    )}

                    {/* Status icon */}
                    <div
                      className={cn(
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0",
                        config.className,
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          milestone.status === "in_progress" && "animate-spin",
                        )}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <p
                        className={cn(
                          "font-medium",
                          milestone.status === "completed" && "line-through text-muted-foreground",
                        )}
                      >
                        {milestone.name}
                      </p>
                    </div>

                    {/* Date */}
                    <div className="text-sm text-muted-foreground pt-1 flex-shrink-0">
                      {milestone.status === "completed" ? (
                        <span className="text-success">{milestone.completedDate}</span>
                      ) : (
                        <span>Target: {milestone.targetDate}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Linked Workstreams */}
          <section>
            <SectionHeader
              title="Linked Workstreams"
              count={goal.workstreams.length}
              className="mb-4"
            />
            <div className="space-y-3">
              {goal.workstreams.map((workstream) => (
                <div
                  key={workstream.id}
                  className="group rounded-xl border border-border bg-card p-4 shadow-soft transition-all hover:border-primary/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                        <GitBranch className="h-5 w-5 text-info" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{workstream.name}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <AgentAvatar name={workstream.agentName} size="sm" />
                          <span>{workstream.agentName}</span>
                          <span>•</span>
                          <span>{workstream.taskCount} tasks</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-primary">
                      <Link href={`/workstreams/${workstream.id}`}>
                        View
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={workstream.progress} className="h-2 flex-1" />
                    <span className="text-xs font-medium tabular-nums text-muted-foreground w-10 text-right">
                      {workstream.progress}%
                    </span>
                  </div>
                </div>
              ))}

              {/* Link workstream button */}
              <Button
                variant="outline"
                className="w-full h-12 border-dashed bg-transparent"
                onClick={() => setIsLinkWorkstreamOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Link Workstream
              </Button>
            </div>
          </section>
        </main>

        {/* Link Workstream Dialog */}
        <Dialog open={isLinkWorkstreamOpen} onOpenChange={setIsLinkWorkstreamOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-primary" />
                Link Workstream
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Select Workstream</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a workstream to link" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkstreams.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          {ws.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Or create a new workstream for this goal
                </p>
                <Button variant="link" size="sm" className="text-primary">
                  Create New Workstream
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLinkWorkstreamOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsLinkWorkstreamOpen(false)}>Link Workstream</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
