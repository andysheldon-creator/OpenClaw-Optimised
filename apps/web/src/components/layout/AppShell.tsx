import * as React from "react";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { ApprovalAttentionNudgeConnected } from "@/components/composed/ApprovalAttentionNudge";
import {
  GlobalSearchDialog,
  useGlobalSearchDialog,
} from "@/components/composed/GlobalSearchDialog";

export interface AppShellProps {
  /** Main content to render */
  children: React.ReactNode;
  /** Optional right panel content */
  panel?: React.ReactNode;
  /** Additional className for the main content area */
  className?: string;
}

/**
 * Main application layout shell providing sidebar navigation and content areas.
 *
 * Responsive breakpoints:
 * - Desktop XL (>1400px): Sidebar + content + optional panel
 * - Desktop (1024-1400px): Sidebar + content
 * - Tablet (768-1023px): Collapsible sidebar (64px collapsed)
 * - Mobile (<768px): Bottom nav (handled separately)
 */
export function AppShell({ children, panel, className }: AppShellProps) {
  const globalSearch = useGlobalSearchDialog();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Global Search Dialog (Cmd+Shift+F) */}
      <GlobalSearchDialog
        open={globalSearch.open}
        onOpenChange={globalSearch.setOpen}
      />

      {/* Sidebar - Hidden on mobile, shown on tablet+ */}
      <div className="hidden md:flex">
        <Sidebar onSearchClick={() => globalSearch.setOpen(true)} />
      </div>

      {/* Main Content Area */}
      <motion.main
        initial={false}
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          className
        )}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Primary Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
            <ApprovalAttentionNudgeConnected
              className={cn(
                "sticky top-0 z-40",
                "mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8",
                "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
              )}
            />
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>

          {/* Optional Right Panel - Only visible on XL screens */}
          {panel && (
            <motion.aside
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 320 }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden xl:flex flex-col border-l border-border bg-card"
            >
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin p-4">
                {panel}
              </div>
            </motion.aside>
          )}
        </div>
      </motion.main>
    </div>
  );
}
