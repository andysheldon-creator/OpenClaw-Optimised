"use client";

import { cn } from "@/lib/utils";

interface AgentAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  status?: "active" | "ready" | "paused" | "offline";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-base",
};

const statusColors = {
  active: "bg-success",
  ready: "bg-success",
  paused: "bg-warning",
  offline: "bg-muted-foreground/50",
};

const statusDotSizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string) {
  const colors = [
    "bg-chart-1/15 text-chart-1",
    "bg-chart-2/15 text-chart-2",
    "bg-chart-3/15 text-chart-3",
    "bg-chart-4/20 text-chart-4",
    "bg-chart-5/15 text-chart-5",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function AgentAvatar({ name, size = "md", status, className }: AgentAvatarProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-xl font-medium",
          sizeClasses[size],
          getColorFromName(name),
        )}
      >
        {getInitials(name)}
      </div>
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card",
            statusDotSizes[size],
            statusColors[status],
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
}
