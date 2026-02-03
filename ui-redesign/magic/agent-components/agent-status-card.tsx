// Source: Magic MCP Server - 21st_magic_component_builder
// Component: AgentStatusCard
// Search Query: "agent status card"

"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Activity,
  Pause,
  Play,
  Settings,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import * as React from "react";
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

// HyperText component implementation
interface HyperTextProps {
  text: string;
  duration?: number;
  framerProps?: Variants;
  className?: string;
  animateOnLoad?: boolean;
  trigger?: boolean;
}

const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const getRandomInt = (max: number) => Math.floor(Math.random() * max);

function HyperText({
  text,
  duration = 800,
  framerProps = {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 3 },
  },
  className,
  animateOnLoad = true,
  trigger = false,
}: HyperTextProps) {
  const [displayText, setDisplayText] = React.useState(text.split(""));
  const [triggerAnim, setTriggerAnim] = React.useState(false);
  const interations = React.useRef(0);
  const isFirstRender = React.useRef(true);

  const triggerAnimation = () => {
    interations.current = 0;
    setTriggerAnim(true);
  };

  React.useEffect(() => {
    const interval = setInterval(
      () => {
        if (!animateOnLoad && isFirstRender.current) {
          clearInterval(interval);
          isFirstRender.current = false;
          return;
        }
        if (interations.current < text.length) {
          setDisplayText((t) =>
            t.map((l, i) =>
              l === " " ? l : i <= interations.current ? text[i] : alphabets[getRandomInt(26)],
            ),
          );
          interations.current = interations.current + 0.1;
        } else {
          setTriggerAnim(false);
          clearInterval(interval);
        }
      },
      duration / (text.length * 10),
    );
    return () => clearInterval(interval);
  }, [text, duration, triggerAnim, animateOnLoad, trigger]);

  return (
    <div className="flex scale-100 cursor-default overflow-hidden" onMouseEnter={triggerAnimation}>
      <AnimatePresence mode="wait">
        {displayText.map((letter, i) => (
          <motion.span
            key={i}
            className={cn("font-mono", letter === " " ? "w-3" : "", className)}
            {...framerProps}
          >
            {letter.toUpperCase()}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Status indicator component
const StatusIndicator = ({ status }: { status: AgentStatus }) => {
  const statusConfig = {
    active: {
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-900/40",
      label: "Active",
      showPulse: true,
    },
    idle: {
      icon: Clock,
      color: "text-gray-500",
      bgColor: "bg-gray-100 dark:bg-gray-700",
      label: "Idle",
      showPulse: false,
    },
    busy: {
      icon: Loader2,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-900/40",
      label: "Busy",
      showPulse: false,
    },
    error: {
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-900/40",
      label: "Error",
      showPulse: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full", config.bgColor)}>
      <div className="relative">
        <Icon
          className={cn("w-4 h-4", config.color, status === "busy" && "animate-spin")}
          strokeWidth={3}
        />
        {config.showPulse && (
          <span className="absolute inset-0 flex">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          </span>
        )}
      </div>
      <span className={cn("text-sm font-semibold", config.color)}>{config.label}</span>
    </div>
  );
};

// Main component
export const AgentStatusCard = ({
  agentName = "AI Agent Alpha",
  status = "active",
  currentTask = "Processing data analysis for customer insights",
  lastActivity = "2 minutes ago",
  variant = "expanded",
  onPause,
  onResume,
  onConfigure,
  className,
}: AgentStatusCardProps) => {
  const [isPaused, setIsPaused] = React.useState(false);

  const handlePauseResume = () => {
    setIsPaused(!isPaused);
    if (isPaused) {
      onResume?.();
    } else {
      onPause?.();
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  if (variant === "compact") {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn(
          "flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow",
          className,
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusIndicator status={status} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{agentName}</h3>
            <p className="text-xs text-muted-foreground truncate">{currentTask}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePauseResume}
            className="p-2 rounded-md hover:bg-accent transition-colors"
            aria-label={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={onConfigure}
            className="p-2 rounded-md hover:bg-accent transition-colors"
            aria-label="Configure"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-lg p-6",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold mb-1">{agentName}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last activity: {lastActivity}
          </p>
        </div>
        <StatusIndicator status={status} />
      </div>

      {/* Current Task */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Current Task</h3>
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          {status === "active" ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{currentTask}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{currentTask}</p>
          )}
        </div>
      </div>

      {/* Status Display with Animation */}
      {status === "active" && (
        <div className="mb-6">
          <div className="relative">
            <svg
              width="100%"
              height="36"
              viewBox="0 0 180 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full max-w-[180px]"
            >
              <defs>
                <linearGradient id="activeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#15803d" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              <path
                d="M0 0H180V24H8L0 16V0Z"
                fill="url(#activeGradient)"
                stroke="#4ade80"
                strokeWidth="1.5"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-start pl-4 pb-3">
              <HyperText
                text="PROCESSING"
                className="text-green-300 text-xs font-mono tracking-wider font-semibold"
                duration={1000}
                animateOnLoad={true}
                trigger={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handlePauseResume}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors",
            isPaused
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-yellow-500 hover:bg-yellow-600 text-white",
          )}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" />
              Resume
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          )}
        </button>
        <button
          onClick={onConfigure}
          className="px-4 py-2.5 rounded-lg border border-border hover:bg-accent transition-colors"
          aria-label="Configure"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};

// Demo component
export default function AgentStatusCardDemo() {
  const [status, setStatus] = React.useState<AgentStatus>("active");

  const handlePause = () => {
    console.log("Agent paused");
    setStatus("idle");
  };

  const handleResume = () => {
    console.log("Agent resumed");
    setStatus("active");
  };

  const handleConfigure = () => {
    console.log("Configure clicked");
  };

  return (
    <div className="min-h-screen w-full bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Agent Status Cards</h1>
          <p className="text-muted-foreground">Monitor and control your AI agents</p>
        </div>

        {/* Expanded Variants */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Expanded View</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AgentStatusCard
              agentName="AI Agent Alpha"
              status="active"
              currentTask="Processing data analysis for customer insights"
              lastActivity="2 minutes ago"
              variant="expanded"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Beta"
              status="busy"
              currentTask="Training machine learning model"
              lastActivity="5 minutes ago"
              variant="expanded"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Gamma"
              status="idle"
              currentTask="Waiting for new tasks"
              lastActivity="1 hour ago"
              variant="expanded"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Delta"
              status="error"
              currentTask="Connection timeout - retrying"
              lastActivity="30 seconds ago"
              variant="expanded"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
          </div>
        </div>

        {/* Compact Variants */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Compact View (List)</h2>
          <div className="space-y-3">
            <AgentStatusCard
              agentName="AI Agent Alpha"
              status="active"
              currentTask="Processing data analysis"
              lastActivity="2 minutes ago"
              variant="compact"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Beta"
              status="busy"
              currentTask="Training ML model"
              lastActivity="5 minutes ago"
              variant="compact"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Gamma"
              status="idle"
              currentTask="Waiting for tasks"
              lastActivity="1 hour ago"
              variant="compact"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
            <AgentStatusCard
              agentName="AI Agent Delta"
              status="error"
              currentTask="Connection timeout"
              lastActivity="30 seconds ago"
              variant="compact"
              onPause={handlePause}
              onResume={handleResume}
              onConfigure={handleConfigure}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
