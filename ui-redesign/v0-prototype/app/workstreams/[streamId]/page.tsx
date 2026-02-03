"use client";

import {
  ArrowLeft,
  List,
  Settings,
  MoreHorizontal,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppShell } from "@/components/navigation/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { AddTaskDialog } from "@/components/workstreams/add-task-dialog";
import { TaskDetailPanel } from "@/components/workstreams/task-detail-panel";
import { TaskNode, type TaskStatus } from "@/components/workstreams/task-node";
import { cn } from "@/lib/utils";

// Mock data
const workstreamData = {
  "q1-launch": {
    id: "q1-launch",
    name: "Q1 Launch Prep",
    agentName: "Research Assistant",
    progress: 78,
    tasks: [
      {
        id: "1",
        name: "Research Market",
        status: "complete" as TaskStatus,
        description:
          "Conduct comprehensive market research to understand the current landscape and identify key opportunities.",
        dependencies: [],
        blocks: ["2", "3"],
        subtasks: [
          { id: "1a", name: "Identify competitors", status: "complete" as const },
          { id: "1b", name: "Survey customers", status: "complete" as const },
          { id: "1c", name: "Analyze pricing", status: "complete" as const },
        ],
      },
      {
        id: "2",
        name: "Analyze Trends",
        status: "complete" as TaskStatus,
        description:
          "Analyze market trends based on research findings to identify growth opportunities.",
        dependencies: ["1"],
        blocks: ["4"],
        subtasks: [],
      },
      {
        id: "3",
        name: "Compile Data",
        status: "complete" as TaskStatus,
        description: "Compile all research data into a structured format for report generation.",
        dependencies: ["1"],
        blocks: ["4"],
        subtasks: [],
      },
      {
        id: "4",
        name: "Generate Report",
        status: "running" as TaskStatus,
        progress: 65,
        startedAt: "10m ago",
        description:
          "Generate a comprehensive report summarizing the market research findings and trend analysis.",
        dependencies: ["2", "3"],
        blocks: ["5"],
        subtasks: [
          { id: "4a", name: "Outline sections", status: "complete" as const },
          { id: "4b", name: "Write executive summary", status: "complete" as const },
          { id: "4c", name: "Generate charts", status: "in_progress" as const },
          { id: "4d", name: "Format document", status: "pending" as const },
        ],
      },
      {
        id: "5",
        name: "Review Draft",
        status: "pending" as TaskStatus,
        description: "Review the generated report draft and provide feedback for improvements.",
        dependencies: ["4"],
        blocks: ["6"],
        subtasks: [],
      },
      {
        id: "6",
        name: "Present to Team",
        status: "pending" as TaskStatus,
        description: "Present the final report findings to the team.",
        dependencies: ["5"],
        blocks: [],
        subtasks: [],
      },
    ],
  },
};

// Simple DAG layout - position tasks in columns based on depth
function getTaskPositions(tasks: (typeof workstreamData)["q1-launch"]["tasks"]) {
  const positions: Record<string, { x: number; y: number; depth: number }> = {};
  const depths: Record<string, number> = {};

  // Calculate depth for each task
  function calculateDepth(taskId: string): number {
    if (depths[taskId] !== undefined) {
      return depths[taskId];
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.dependencies.length === 0) {
      depths[taskId] = 0;
      return 0;
    }
    const maxDepDep = Math.max(...task.dependencies.map((d) => calculateDepth(d)));
    depths[taskId] = maxDepDep + 1;
    return depths[taskId];
  }

  tasks.forEach((task) => calculateDepth(task.id));

  // Group tasks by depth
  const depthGroups: Record<number, string[]> = {};
  for (const [id, depth] of Object.entries(depths)) {
    if (!depthGroups[depth]) {
      depthGroups[depth] = [];
    }
    depthGroups[depth].push(id);
  }

  // Calculate positions
  const nodeWidth = 160;
  const nodeHeight = 110;
  const horizontalGap = 80;
  const verticalGap = 40;

  for (const [depth, ids] of Object.entries(depthGroups)) {
    const d = parseInt(depth);
    const totalHeight = ids.length * nodeHeight + (ids.length - 1) * verticalGap;
    const startY = -totalHeight / 2;

    ids.forEach((id, index) => {
      positions[id] = {
        x: d * (nodeWidth + horizontalGap),
        y: startY + index * (nodeHeight + verticalGap),
        depth: d,
      };
    });
  }

  return positions;
}

export default function WorkstreamPage() {
  const params = useParams();
  const streamId = params.streamId as string;
  const workstream = workstreamData["q1-launch"]; // Use mock data for demo

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<"dag" | "list">("dag");

  const positions = getTaskPositions(workstream.tasks);
  const selectedTask = workstream.tasks.find((t) => t.id === selectedTaskId);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 10, 150));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 10, 50));
  const handleFit = () => setZoom(100);

  // Get full task details for the panel
  const getTaskDetails = useCallback(
    (taskId: string) => {
      const task = workstream.tasks.find((t) => t.id === taskId);
      if (!task) {
        return null;
      }
      return {
        ...task,
        dependencies: task.dependencies.map((depId) => {
          const dep = workstream.tasks.find((t) => t.id === depId);
          return {
            id: depId,
            name: dep?.name || "",
            status: dep?.status || ("pending" as TaskStatus),
          };
        }),
        blocks: task.blocks.map((blockId) => {
          const block = workstream.tasks.find((t) => t.id === blockId);
          return {
            id: blockId,
            name: block?.name || "",
            status: block?.status || ("pending" as TaskStatus),
          };
        }),
      };
    },
    [workstream.tasks],
  );

  // Calculate SVG viewBox dimensions
  const minX = Math.min(...Object.values(positions).map((p) => p.x)) - 20;
  const maxX = Math.max(...Object.values(positions).map((p) => p.x)) + 180;
  const minY = Math.min(...Object.values(positions).map((p) => p.y)) - 20;
  const maxY = Math.max(...Object.values(positions).map((p) => p.y)) + 120;

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-7xl px-4 pb-24 md:px-6">
          {/* Workstream Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                href="/agents"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{workstream.name}</h1>
                <p className="text-muted-foreground">
                  {workstream.agentName} · {workstream.progress}% complete
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "list" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setViewMode(viewMode === "dag" ? "list" : "dag")}
                >
                  <List className="h-4 w-4 mr-1" />
                  {viewMode === "dag" ? "List View" : "DAG View"}
                </Button>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Duplicate Workstream</DropdownMenuItem>
                    <DropdownMenuItem>Export</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Delete Workstream
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <Progress value={workstream.progress} className="mt-4 h-2" />
          </div>

          {/* DAG Canvas */}
          <div className="flex h-[calc(100vh-320px)] min-h-[500px] rounded-xl border border-border bg-card shadow-soft overflow-hidden">
            {/* Canvas Area */}
            <div className="flex-1 relative overflow-auto">
              {viewMode === "dag" ? (
                <div
                  className="min-w-full min-h-full flex items-center justify-center p-8"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: "center center",
                  }}
                >
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      width: maxX - minX,
                      height: maxY - minY,
                      left: "50%",
                      top: "50%",
                      transform: `translate(-50%, -50%)`,
                    }}
                    viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
                  >
                    {/* Draw edges */}
                    {workstream.tasks.map((task) =>
                      task.blocks.map((blockId) => {
                        const fromPos = positions[task.id];
                        const toPos = positions[blockId];
                        if (!fromPos || !toPos) {
                          return null;
                        }
                        const startX = fromPos.x + 140;
                        const startY = fromPos.y + 45;
                        const endX = toPos.x;
                        const endY = toPos.y + 45;
                        const midX = (startX + endX) / 2;
                        return (
                          <path
                            key={`${task.id}-${blockId}`}
                            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                            fill="none"
                            stroke="var(--color-border)"
                            strokeWidth="2"
                            markerEnd="url(#arrowhead)"
                          />
                        );
                      }),
                    )}
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-border)" />
                      </marker>
                    </defs>
                  </svg>

                  {/* Task Nodes */}
                  <div
                    className="relative"
                    style={{
                      width: maxX - minX,
                      height: maxY - minY,
                    }}
                  >
                    {workstream.tasks.map((task) => {
                      const pos = positions[task.id];
                      return (
                        <div
                          key={task.id}
                          className="absolute"
                          style={{
                            left: pos.x - minX,
                            top: pos.y - minY,
                          }}
                        >
                          <TaskNode
                            task={task}
                            selected={selectedTaskId === task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* List View */
                <div className="p-6 space-y-3">
                  {workstream.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        "w-full text-left p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors",
                        selectedTaskId === task.id && "ring-2 ring-primary",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{task.name}</span>
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            task.status === "complete" && "bg-success/10 text-success",
                            task.status === "running" && "bg-info/10 text-info",
                            task.status === "pending" && "bg-muted text-muted-foreground",
                            task.status === "blocked" && "bg-destructive/10 text-destructive",
                          )}
                        >
                          {task.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {task.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* Canvas Controls */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1 shadow-soft">
                <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium tabular-nums w-12 text-center">{zoom}%</span>
                <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-border" />
                <Button variant="ghost" size="sm" onClick={handleFit}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Add Task Button */}
              <div className="absolute bottom-4 right-4">
                <Button onClick={() => setIsAddTaskOpen(true)} className="shadow-soft">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Task
                </Button>
              </div>
            </div>

            {/* Task Detail Panel */}
            {selectedTask && (
              <TaskDetailPanel
                task={getTaskDetails(selectedTask.id)}
                onClose={() => setSelectedTaskId(null)}
                onEdit={() => {}}
                onPause={() => {}}
                onDelete={() => {}}
              />
            )}
          </div>
        </main>

        {/* Add Task Dialog */}
        <AddTaskDialog
          open={isAddTaskOpen}
          onOpenChange={setIsAddTaskOpen}
          existingTasks={workstream.tasks.map((t) => ({ id: t.id, name: t.name }))}
          onSubmit={(task) => {
            console.log("New task:", task);
          }}
        />
      </div>
    </AppShell>
  );
}
