"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Pause,
  Play,
  Settings,
  AlertCircle,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Type definitions
type AgentStatus = "active" | "idle" | "busy" | "error";

interface AgentStatusCardProps {
  agentName?: string;
  status?: AgentStatus;
  currentTask?: string;
  lastActivity?: string;
  variant?: "expanded" | "compact";
  onPause?: () => void;
  onResume?: () => void;
  onConfigure?: () => void;
  className?: string;
}

// Status indicator component with pulsing animation
const StatusIndicator = ({ status }: { status: AgentStatus }) => {
  const statusConfig = {
    active: {
      color: "bg-green-500",
      icon: CheckCircle2,
      label: "Active",
      pulse: true,
    },
    idle: {
      color: "bg-gray-400",
      icon: Circle,
      label: "Idle",
      pulse: false,
    },
    busy: {
      color: "bg-blue-500",
      icon: Loader2,
      label: "Busy",
      pulse: false,
    },
    error: {
      color: "bg-red-500",
      icon: AlertCircle,
      label: "Error",
      pulse: true,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={cn("h-2.5 w-2.5 rounded-full", config.color)} />
        {config.pulse && (
          <motion.div
            className={cn("absolute inset-0 h-2.5 w-2.5 rounded-full", config.color, "opacity-75")}
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.75, 0, 0.75],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "h-4 w-4",
            status === "active" && "text-green-600 dark:text-green-500",
            status === "idle" && "text-gray-600 dark:text-gray-400",
            status === "busy" && "text-blue-600 dark:text-blue-500 animate-spin",
            status === "error" && "text-red-600 dark:text-red-500",
          )}
        />
        <span
          className={cn(
            "text-sm font-medium",
            status === "active" && "text-green-700 dark:text-green-400",
            status === "idle" && "text-gray-700 dark:text-gray-400",
            status === "busy" && "text-blue-700 dark:text-blue-400",
            status === "error" && "text-red-700 dark:text-red-400",
          )}
        >
          {config.label}
        </span>
      </div>
    </div>
  );
};

// Expanded variant component
const ExpandedCard = ({
  agentName,
  status,
  currentTask,
  lastActivity,
  onPause,
  onResume,
  onConfigure,
  className,
}: AgentStatusCardProps) => {
  const isPaused = status === "idle";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn("p-6 space-y-4", className)}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{agentName}</h3>
            <StatusIndicator status={status!} />
          </div>
          <Activity className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Current Task */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span className="font-medium">Current Task</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <motion.div
            className="rounded-lg bg-muted/50 p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-sm">{currentTask || "No active task"}</p>
          </motion.div>
        </div>

        {/* Last Activity */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last activity: {lastActivity}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onConfigure}>
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

// Compact variant component
const CompactCard = ({
  agentName,
  status,
  currentTask,
  lastActivity,
  onPause,
  onResume,
  onConfigure,
  className,
}: AgentStatusCardProps) => {
  const isPaused = status === "idle";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.01 }}
    >
      <Card className={cn("p-4", className)}>
        <div className="flex items-center justify-between gap-4">
          {/* Left section */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0">
              <StatusIndicator status={status!} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm truncate">{agentName}</h4>
              <p className="text-xs text-muted-foreground truncate">
                {currentTask || "No active task"}
              </p>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">{lastActivity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={isPaused ? onResume : onPause}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onConfigure}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

// Main component
export const AgentStatusCard = ({
  agentName = "AI Agent",
  status = "active",
  currentTask = "Processing data analysis",
  lastActivity = "2 minutes ago",
  variant = "expanded",
  onPause = () => console.log("Pause clicked"),
  onResume = () => console.log("Resume clicked"),
  onConfigure = () => console.log("Configure clicked"),
  className,
}: AgentStatusCardProps) => {
  if (variant === "compact") {
    return (
      <CompactCard
        agentName={agentName}
        status={status}
        currentTask={currentTask}
        lastActivity={lastActivity}
        onPause={onPause}
        onResume={onResume}
        onConfigure={onConfigure}
        className={className}
      />
    );
  }

  return (
    <ExpandedCard
      agentName={agentName}
      status={status}
      currentTask={currentTask}
      lastActivity={lastActivity}
      onPause={onPause}
      onResume={onResume}
      onConfigure={onConfigure}
      className={className}
    />
  );
};

// Demo component
export default function AgentStatusCardDemo() {
  const [agents, setAgents] = React.useState([
    {
      id: 1,
      name: "Data Processor",
      status: "active" as AgentStatus,
      task: "Analyzing customer behavior patterns",
      lastActivity: "Just now",
    },
    {
      id: 2,
      name: "Content Generator",
      status: "busy" as AgentStatus,
      task: "Creating marketing content for Q4 campaign",
      lastActivity: "5 minutes ago",
    },
    {
      id: 3,
      name: "Report Builder",
      status: "idle" as AgentStatus,
      task: "Waiting for next scheduled task",
      lastActivity: "1 hour ago",
    },
    {
      id: 4,
      name: "Email Responder",
      status: "error" as AgentStatus,
      task: "Failed to connect to email server",
      lastActivity: "10 minutes ago",
    },
  ]);

  const handlePause = (id: number) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, status: "idle" as AgentStatus } : agent)),
    );
  };

  const handleResume = (id: number) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, status: "active" as AgentStatus } : agent,
      ),
    );
  };

  const handleConfigure = (id: number) => {
    console.log(`Configure agent ${id}`);
  };

  return (
    <div className="min-h-screen w-full bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Agent Status Dashboard</h1>
          <p className="text-muted-foreground">Monitor and control your AI agents</p>
        </div>

        {/* Expanded Cards Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Detail View</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.slice(0, 2).map((agent) => (
              <AgentStatusCard
                key={agent.id}
                agentName={agent.name}
                status={agent.status}
                currentTask={agent.task}
                lastActivity={agent.lastActivity}
                variant="expanded"
                onPause={() => handlePause(agent.id)}
                onResume={() => handleResume(agent.id)}
                onConfigure={() => handleConfigure(agent.id)}
              />
            ))}
          </div>
        </div>

        {/* Compact Cards Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">List View</h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <AgentStatusCard
                key={agent.id}
                agentName={agent.name}
                status={agent.status}
                currentTask={agent.task}
                lastActivity={agent.lastActivity}
                variant="compact"
                onPause={() => handlePause(agent.id)}
                onResume={() => handleResume(agent.id)}
                onConfigure={() => handleConfigure(agent.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
