"use client";

import type { ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  href?: string;
  addHref?: string;
  addLabel?: string;
  children: ReactNode;
  className?: string;
}

export function MetricCard({
  title,
  href,
  addHref,
  addLabel,
  children,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card p-4 shadow-soft",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="flex-1 space-y-2">{children}</div>
      {addHref && (
        <div className="mt-3 pt-3 border-t border-border">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <Link href={addHref}>
              <Plus className="h-3.5 w-3.5" />
              {addLabel || "Add new"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

interface MetricItemProps {
  icon?: ReactNode;
  label: string;
  value?: string;
  progress?: number;
  className?: string;
}

export function MetricItem({ icon, label, value, progress, className }: MetricItemProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 text-sm", className)}>
      <div className="flex items-center gap-2 text-foreground">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      {value && <span className="text-xs text-muted-foreground whitespace-nowrap">{value}</span>}
      {progress !== undefined && (
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
            {progress}%
          </span>
        </div>
      )}
    </div>
  );
}
