import * as React from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Home,
  MessageCircle,
  ShieldCheck,
  Clock,
  Target,
  Brain,
  User,
  Bot,
  ListTodo,
  RefreshCw,
  Zap,
  Monitor,
  Settings,
  Plug,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bug,
  HardDrive,
  Calendar,
  Share2,
  Search,
} from "lucide-react";
import { useUIStore } from "@/stores/useUIStore";
import { NavItem } from "./NavItem";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { GatewayStatusIndicator } from "@/components/composed/GatewayStatusIndicator";
import { AgentSessionsIndicator } from "@/components/composed/AgentSessionsIndicator";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  /** Additional className */
  className?: string;
  /** Callback when the search button is clicked */
  onSearchClick?: () => void;
}

interface NavSectionProps {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function NavSection({ title, collapsed, children, defaultOpen = true }: NavSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="space-y-1">
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
            "hover:text-foreground transition-colors",
            collapsed && "justify-center px-2"
          )}
        >
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 text-left"
              >
                {title}
              </motion.span>
            )}
          </AnimatePresence>
          {!collapsed && (
            <motion.div
              animate={{ rotate: open ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="size-3" />
            </motion.div>
          )}
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content forceMount>
        <motion.div
          initial={false}
          animate={{
            height: open || collapsed ? "auto" : 0,
            opacity: open || collapsed ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <nav className="space-y-0.5">{children}</nav>
        </motion.div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function Sidebar({ className, onSearchClick }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, powerUserMode } = useUIStore();

  return (
    <motion.aside
      initial={false}
      animate={{
        width: sidebarCollapsed ? 72 : 256,
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={cn(
        "relative flex h-full flex-col border-r border-border bg-card",
        className
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            S
          </div>
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap font-semibold text-foreground"
              >
                Clawdbrain
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Search Button */}
      {onSearchClick && (
        <div className="px-2 pt-3">
          <button
            type="button"
            onClick={onSearchClick}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
              "hover:bg-muted hover:text-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              sidebarCollapsed && "justify-center px-2"
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-hidden whitespace-nowrap text-left"
                >
                  Search...
                </motion.span>
              )}
            </AnimatePresence>
            {!sidebarCollapsed && (
              <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline-block">
                ⌘⇧F
              </kbd>
            )}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-4 space-y-4">
        {/* Primary Navigation */}
        <nav className="space-y-0.5 px-2">
          <NavItem href="/" icon={Home} label="Home" collapsed={sidebarCollapsed} />
          <NavItem
            href="/conversations"
            icon={MessageCircle}
            label="Chat"
            collapsed={sidebarCollapsed}
          />
          <NavItem
            href="/agent-status"
            icon={ShieldCheck}
            label="Approvals"
            collapsed={sidebarCollapsed}
          />
          <NavItem
            href="/workstreams"
            icon={Clock}
            label="Activity"
            collapsed={sidebarCollapsed}
          />
        </nav>

        <Separator className="mx-2" />

        {/* Explore Section - collapsed by default in Simple mode */}
        <div className="px-2">
          <NavSection
            title="Explore"
            collapsed={sidebarCollapsed}
            defaultOpen={powerUserMode}
          >
            <NavItem
              href="/agents"
              icon={Bot}
              label="Agents"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/workstreams"
              icon={ListTodo}
              label="Workstreams"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/automations"
              icon={Zap}
              label="Automations"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/goals"
              icon={Target}
              label="Goals"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/memories"
              icon={Brain}
              label="Memories"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/rituals"
              icon={RefreshCw}
              label="Rituals"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/nodes"
              icon={Monitor}
              label="Nodes"
              collapsed={sidebarCollapsed}
            />
            <NavItem
              href="/you"
              icon={User}
              label="You"
              collapsed={sidebarCollapsed}
            />
          </NavSection>
        </div>

        {/* Power User Section - Only visible when powerUserMode is enabled */}
        {powerUserMode && (
          <>
            <Separator className="mx-2" />
            <div className="px-2">
              <NavSection title="Power User" collapsed={sidebarCollapsed} defaultOpen={false}>
                <NavItem
                  href="/debug"
                  icon={Bug}
                  label="Debug"
                  collapsed={sidebarCollapsed}
                />
                <NavItem
                  href="/debug/graph"
                  icon={Share2}
                  label="Graph"
                  collapsed={sidebarCollapsed}
                />
                <NavItem
                  href="/filesystem"
                  icon={HardDrive}
                  label="Filesystem"
                  collapsed={sidebarCollapsed}
                />
                <NavItem
                  href="/jobs"
                  icon={Calendar}
                  label="Jobs"
                  collapsed={sidebarCollapsed}
                />
              </NavSection>
            </div>
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-border p-2">
        {/* Agent Session Indicators */}
        <div className="space-y-0.5 mb-2">
          <AgentSessionsIndicator collapsed={sidebarCollapsed} />
        </div>

        {/* Separator between agent status and system status */}
        <Separator className="my-2" />

        {/* Gateway Status + Workspace Switcher (centered when collapsed) */}
        <div className="space-y-0.5 mb-2">
          <GatewayStatusIndicator collapsed={sidebarCollapsed} />
          <WorkspaceSwitcher
            collapsed={sidebarCollapsed}
            onCreateWorkspace={() => {
              // TODO: Open create workspace modal
              console.log("Create workspace");
            }}
          />
        </div>

        {/* Separator between status and actions */}
        <Separator className="my-2" />

        {/* Actions Section */}
        <div className="space-y-0.5">
          <NavItem
            href="/settings"
            icon={Settings}
            label="Settings"
            collapsed={sidebarCollapsed}
            inactiveWhenSearch={{ section: "connections" }}
          />
          <NavItem
            href="/settings"
            search={{ section: "connections" }}
            icon={Plug}
            label="Connections"
            collapsed={sidebarCollapsed}
            exactMatch
          />
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "absolute -right-4 top-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="size-4" />
        ) : (
          <ChevronLeft className="size-4" />
        )}
      </button>
    </motion.aside>
  );
}
