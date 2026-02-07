"use client";

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bot,
  MessageCircle,
  Target,
  Brain,
  RefreshCw,
  ListTodo,
  Plus,
  Moon,
  Sun,
  Settings,
  Zap,
  Keyboard,
  PanelLeftClose,
  AlertCircle,
  Clock,
  ChevronRight,
  ArrowLeft,
  LayoutDashboard,
  Palette,
  Monitor,
  Globe,
  Cog,
  Eye,
  Pencil,
  History,
  Filter,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useUIStore } from "@/stores/useUIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useConversationStore } from "@/stores/useConversationStore";
import { derivePendingApprovalsSummary } from "@/lib/approvals/pending";
import { showInfo } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

/** Categories used for filtering search results */
type CommandCategory =
  | "all"
  | "navigation"
  | "agents"
  | "settings"
  | "appearance"
  | "quick-actions";

/** A page entry in the navigation stack */
interface PageEntry {
  /** Page identifier — either a static page or a dynamic one like "agent:{id}" */
  id: string;
  /** Display label in breadcrumb */
  label: string;
  /** Optional icon for breadcrumb */
  icon?: LucideIcon;
  /** Optional context data (e.g., agentId) */
  context?: Record<string, string>;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts?: () => void;
}

// ─── Sub-menu definitions ───────────────────────────────────────

interface SubMenuDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

const SUB_MENUS: SubMenuDef[] = [
  { id: "navigation", label: "Navigate to...", icon: Globe },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "settings", label: "Settings & Config", icon: Cog },
];

/** Category filter definitions */
const CATEGORY_FILTERS: { id: CommandCategory; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "All", icon: Filter },
  { id: "quick-actions", label: "Quick Actions", icon: Zap },
  { id: "navigation", label: "Navigation", icon: Globe },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "settings", label: "Settings", icon: Cog },
];

// ─── Helper: get current page from stack ────────────────────────

function currentPage(stack: PageEntry[]): PageEntry {
  return stack[stack.length - 1];
}

function isRootPage(stack: PageEntry[]): boolean {
  return stack.length === 1 && stack[0].id === "root";
}

// ─── Component ──────────────────────────────────────────────────

export function CommandPalette({
  open,
  onOpenChange,
  onShowShortcuts,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [pageStack, setPageStack] = React.useState<PageEntry[]>([
    { id: "root", label: "Commands" },
  ]);
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<CommandCategory>("all");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const page = currentPage(pageStack);
  const isRoot = isRootPage(pageStack);

  const {
    theme,
    setTheme,
    powerUserMode,
    setPowerUserMode,
    toggleSidebar,
    setAttentionSnoozeUntilMs,
  } = useUIStore();
  const agents = useAgentStore((s) => s.agents);
  const conversations = useConversationStore((s) => s.conversations);
  const approvals = React.useMemo(
    () => derivePendingApprovalsSummary(agents),
    [agents]
  );

  // Reset page stack and search when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setPageStack([{ id: "root", label: "Commands" }]);
      setSearch("");
      setCategoryFilter("all");
    }
  }, [open]);

  // Navigation helpers
  const pushPage = React.useCallback(
    (entry: PageEntry) => {
      setPageStack((prev) => [...prev, entry]);
      setSearch("");
      setCategoryFilter("all");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    []
  );

  const popPage = React.useCallback(() => {
    setPageStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setSearch("");
    setCategoryFilter("all");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const goToRoot = React.useCallback(() => {
    setPageStack([{ id: "root", label: "Commands" }]);
    setSearch("");
    setCategoryFilter("all");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Handle back navigation with Backspace on empty search
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRoot && e.key === "Backspace" && !search) {
        e.preventDefault();
        popPage();
      }
      if (e.key === "Escape" && !isRoot) {
        e.preventDefault();
        goToRoot();
      }
    },
    [isRoot, search, popPage, goToRoot]
  );

  const handleSelect = React.useCallback(
    (action: () => void) => {
      action();
      onOpenChange(false);
    },
    [onOpenChange]
  );

  // ─── Action handlers ────────────────────────────────────────

  const handleNewConversation = React.useCallback(() => {
    navigate({ to: "/conversations" });
  }, [navigate]);

  const handleToggleTheme = React.useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  }, [theme, setTheme]);

  const handleTogglePowerUser = React.useCallback(() => {
    setPowerUserMode(!powerUserMode);
  }, [powerUserMode, setPowerUserMode]);

  const handleToggleSidebar = React.useCallback(() => {
    toggleSidebar();
  }, [toggleSidebar]);

  const handleGoToAgent = React.useCallback(
    (agentId: string) => {
      navigate({ to: "/agents/$agentId", params: { agentId } });
    },
    [navigate]
  );

  const handleGoToConversation = React.useCallback(
    (conversationId: string) => {
      navigate({
        to: "/conversations/$id",
        params: { id: conversationId },
      });
    },
    [navigate]
  );

  const handleChatWithAgent = React.useCallback(
    (agentId: string) => {
      navigate({
        to: "/agents/$agentId/session/$sessionKey",
        params: { agentId, sessionKey: "current" },
        search: { newSession: false },
      });
    },
    [navigate]
  );

  const handleViewAgentSessions = React.useCallback(
    (agentId: string) => {
      navigate({
        to: "/agents/$agentId",
        params: { agentId },
        search: { tab: "activity" },
      });
    },
    [navigate]
  );

  const handleEditAgent = React.useCallback(
    (agentId: string) => {
      navigate({
        to: "/agents/$agentId",
        params: { agentId },
        search: { tab: "overview" },
      });
    },
    [navigate]
  );

  // ─── Navigation items ───────────────────────────────────────

  const navigationItems = [
    { label: "Home", to: "/" as const, icon: LayoutDashboard },
    { label: "Conversations", to: "/conversations" as const, icon: MessageCircle },
    { label: "Agents", to: "/agents" as const, icon: Bot },
    { label: "Goals", to: "/goals" as const, icon: Target },
    { label: "Memories", to: "/memories" as const, icon: Brain },
    { label: "Rituals", to: "/rituals" as const, icon: RefreshCw },
    { label: "Automations", to: "/automations" as const, icon: Zap },
    { label: "Workstreams", to: "/workstreams" as const, icon: ListTodo },
    { label: "Settings", to: "/you" as const, icon: Settings },
    { label: "Agent Dashboard", to: "/agents/dashboard" as const, icon: Monitor },
  ];

  // Determine input placeholder based on current page
  const placeholder = (() => {
    const id = page.id;
    if (id === "root") return "Type a command or search...";
    if (id === "navigation") return "Search pages...";
    if (id === "agents") return "Search agents...";
    if (id === "appearance") return "Search appearance settings...";
    if (id === "settings") return "Search settings...";
    if (id.startsWith("agent:")) return `Search ${page.label} actions...`;
    return "Search...";
  })();

  // Determine if we should show category filters (only on root page with search)
  const showCategoryFilters = isRoot && search.length > 0;

  // ─── Render: Breadcrumb ─────────────────────────────────────

  const renderBreadcrumb = () => {
    if (isRoot) return null;

    return (
      <div className="flex items-center gap-1 px-3 pt-3 pb-0 flex-wrap">
        <button
          onClick={goToRoot}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Commands
        </button>
        {pageStack.slice(1).map((entry, index) => {
          const isLast = index === pageStack.length - 2;
          return (
            <React.Fragment key={`${entry.id}-${index}`}>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              {isLast ? (
                <span className="text-xs font-medium text-foreground">
                  {entry.label}
                </span>
              ) : (
                <button
                  onClick={() => {
                    // Navigate to this breadcrumb level
                    setPageStack((prev) => prev.slice(0, index + 2));
                    setSearch("");
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {entry.label}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ─── Render: Category Filters ───────────────────────────────

  const renderCategoryFilters = () => {
    if (!showCategoryFilters) return null;

    return (
      <div className="flex items-center gap-1.5 px-3 py-2 border-b overflow-x-auto scrollbar-none">
        {CATEGORY_FILTERS.map((cat) => {
          const isActive = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <cat.icon className="h-3 w-3" />
              {cat.label}
              {isActive && cat.id !== "all" && (
                <X
                  className="h-3 w-3 ml-0.5 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryFilter("all");
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ─── Render helpers for category-filtered root page ─────────
  // When searching on root with a category filter active, we show/hide groups

  const shouldShowCategory = (cat: CommandCategory) =>
    categoryFilter === "all" || categoryFilter === cat;

  // ─── Render: Agent Sub-page ─────────────────────────────────

  const renderAgentSubPage = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      return (
        <CommandGroup heading="Agent not found">
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: "/agents" }))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Go to Agents</span>
          </CommandItem>
        </CommandGroup>
      );
    }

    return (
      <>
        <CommandGroup heading={`${agent.name} — Actions`}>
          <CommandItem
            onSelect={() => handleSelect(() => handleGoToAgent(agent.id))}
          >
            <Eye className="mr-2 h-4 w-4" />
            <span>View Details</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => handleChatWithAgent(agent.id))}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            <span>Chat with {agent.name}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => handleViewAgentSessions(agent.id))}
          >
            <History className="mr-2 h-4 w-4" />
            <span>View Sessions</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => handleEditAgent(agent.id))}
          >
            <Pencil className="mr-2 h-4 w-4" />
            <span>Edit Configuration</span>
          </CommandItem>
        </CommandGroup>

        {/* Agent info */}
        <CommandSeparator />
        <CommandGroup heading="Info">
          <CommandItem disabled>
            <Bot className="mr-2 h-4 w-4" />
            <span className="text-muted-foreground">
              Role: {agent.role}
            </span>
          </CommandItem>
          <CommandItem disabled>
            <div
              className={cn(
                "mr-2 h-2 w-2 rounded-full",
                agent.status === "online"
                  ? "bg-green-500"
                  : agent.status === "busy"
                    ? "bg-yellow-500"
                    : agent.status === "paused"
                      ? "bg-blue-500"
                      : "bg-gray-400"
              )}
            />
            <span className="text-muted-foreground">
              Status: {agent.status}
            </span>
          </CommandItem>
          {agent.currentTask && (
            <CommandItem disabled>
              <ListTodo className="mr-2 h-4 w-4" />
              <span className="text-muted-foreground truncate">
                Task: {agent.currentTask}
              </span>
            </CommandItem>
          )}
        </CommandGroup>
      </>
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search for commands, navigate, or perform actions"
    >
      {/* Breadcrumb for sub-pages */}
      {renderBreadcrumb()}

      <CommandInput
        ref={inputRef}
        placeholder={placeholder}
        value={search}
        onValueChange={setSearch}
        onKeyDown={handleKeyDown}
      />

      {/* Category filter chips (only on root page with search) */}
      {renderCategoryFilters()}

      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* ═══ ROOT PAGE ═══ */}
        {isRoot && (
          <>
            {/* Quick Actions */}
            {shouldShowCategory("quick-actions") && (
              <CommandGroup heading="Quick Actions">
                <CommandItem
                  onSelect={() => handleSelect(handleNewConversation)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>New Conversation</span>
                  <CommandShortcut>N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => handleSelect(handleToggleTheme)}
                >
                  {theme === "dark" ? (
                    <Sun className="mr-2 h-4 w-4" />
                  ) : (
                    <Moon className="mr-2 h-4 w-4" />
                  )}
                  <span>Toggle Theme</span>
                  <CommandShortcut>D</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => handleSelect(handleToggleSidebar)}
                >
                  <PanelLeftClose className="mr-2 h-4 w-4" />
                  <span>Toggle Sidebar</span>
                  <CommandShortcut>\</CommandShortcut>
                </CommandItem>
                {onShowShortcuts && (
                  <CommandItem
                    onSelect={() => handleSelect(onShowShortcuts)}
                  >
                    <Keyboard className="mr-2 h-4 w-4" />
                    <span>Show Keyboard Shortcuts</span>
                    <CommandShortcut>?</CommandShortcut>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {/* Pending Approvals */}
            {shouldShowCategory("quick-actions") &&
              approvals.pendingApprovals > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Approvals">
                    <CommandItem
                      onSelect={() =>
                        handleSelect(() =>
                          navigate({
                            to: "/agents",
                            search: { status: "waiting" },
                          })
                        )
                      }
                    >
                      <AlertCircle className="mr-2 h-4 w-4" />
                      <span>Review waiting approvals</span>
                      <CommandShortcut>W</CommandShortcut>
                    </CommandItem>
                    {approvals.nextAgentId && (
                      <CommandItem
                        onSelect={() =>
                          handleSelect(() =>
                            navigate({
                              to: "/agents/$agentId",
                              params: { agentId: approvals.nextAgentId! },
                              search: { tab: "activity" },
                            })
                          )
                        }
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        <span>Open next approval</span>
                        <CommandShortcut>↵</CommandShortcut>
                      </CommandItem>
                    )}
                    <CommandItem
                      onSelect={() =>
                        handleSelect(() => {
                          setAttentionSnoozeUntilMs(
                            Date.now() + 15 * 60_000
                          );
                          showInfo(
                            "Approval reminders snoozed for 15 minutes."
                          );
                        })
                      }
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      <span>Snooze approval reminders (15m)</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

            {/* Sub-menu launchers — only when not filtering to a specific category */}
            {categoryFilter === "all" && !search && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Categories">
                  {SUB_MENUS.map((menu) => (
                    <CommandItem
                      key={menu.id}
                      onSelect={() =>
                        pushPage({
                          id: menu.id,
                          label: menu.label,
                          icon: menu.icon,
                        })
                      }
                    >
                      <menu.icon className="mr-2 h-4 w-4" />
                      <span>{menu.label}</span>
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Inline Navigation (top 5 for quick access) */}
            {shouldShowCategory("navigation") && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                  {(search ? navigationItems : navigationItems.slice(0, 5)).map(
                    (item) => (
                      <CommandItem
                        key={item.to}
                        onSelect={() =>
                          handleSelect(() => navigate({ to: item.to }))
                        }
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        <span>{item.label}</span>
                      </CommandItem>
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {/* Inline Agents (top 3 for quick chat, or all when searching/filtering) */}
            {shouldShowCategory("agents") && agents.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Agents">
                  {(search || categoryFilter === "agents"
                    ? agents
                    : agents.slice(0, 3)
                  ).map((agent) => (
                    <CommandItem
                      key={`agent-${agent.id}`}
                      onSelect={() =>
                        pushPage({
                          id: `agent:${agent.id}`,
                          label: agent.name,
                          icon: Bot,
                          context: { agentId: agent.id },
                        })
                      }
                    >
                      <Bot className="mr-2 h-4 w-4" />
                      <span>{agent.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {agent.role}
                      </span>
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Appearance items (shown when filtering by appearance) */}
            {shouldShowCategory("appearance") && search && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Appearance">
                  <CommandItem
                    onSelect={() => handleSelect(handleToggleTheme)}
                  >
                    {theme === "dark" ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    <span>
                      Switch to {theme === "dark" ? "Light" : "Dark"} Theme
                    </span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => handleSelect(() => setTheme("dark"))}
                  >
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark Theme</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => handleSelect(() => setTheme("light"))}
                  >
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light Theme</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => handleSelect(handleTogglePowerUser)}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    <span>
                      {powerUserMode ? "Disable" : "Enable"} Power User Mode
                    </span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => handleSelect(handleToggleSidebar)}
                  >
                    <PanelLeftClose className="mr-2 h-4 w-4" />
                    <span>Toggle Sidebar</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {/* Settings items (shown when filtering by settings) */}
            {shouldShowCategory("settings") && search && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                  <CommandItem
                    onSelect={() =>
                      handleSelect(() => navigate({ to: "/you" }))
                    }
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Profile & Preferences</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() =>
                      handleSelect(() => navigate({ to: "/settings" }))
                    }
                  >
                    <Cog className="mr-2 h-4 w-4" />
                    <span>Gateway Configuration</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() =>
                      handleSelect(() => navigate({ to: "/nodes" }))
                    }
                  >
                    <Monitor className="mr-2 h-4 w-4" />
                    <span>Nodes & Devices</span>
                  </CommandItem>
                  {onShowShortcuts && (
                    <CommandItem
                      onSelect={() => handleSelect(onShowShortcuts)}
                    >
                      <Keyboard className="mr-2 h-4 w-4" />
                      <span>Keyboard Shortcuts</span>
                    </CommandItem>
                  )}
                  <CommandItem
                    onSelect={() => handleSelect(handleTogglePowerUser)}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    <span>
                      {powerUserMode ? "Disable" : "Enable"} Power User Mode
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {/* Recent Conversations */}
            {categoryFilter === "all" && !search && conversations.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent Conversations">
                  {conversations.slice(0, 3).map((conversation) => (
                    <CommandItem
                      key={conversation.id}
                      onSelect={() =>
                        handleSelect(() =>
                          handleGoToConversation(conversation.id)
                        )
                      }
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      <span>{conversation.title}</span>
                      {conversation.preview && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {conversation.preview}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}

        {/* ═══ NAVIGATION PAGE ═══ */}
        {page.id === "navigation" && (
          <CommandGroup heading="Pages">
            {navigationItems.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() =>
                  handleSelect(() => navigate({ to: item.to }))
                }
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>Go to {item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ═══ AGENTS PAGE ═══ */}
        {page.id === "agents" && (
          <>
            {agents.length > 0 ? (
              <CommandGroup heading="Select an Agent">
                {agents.map((agent) => (
                  <CommandItem
                    key={agent.id}
                    onSelect={() =>
                      pushPage({
                        id: `agent:${agent.id}`,
                        label: agent.name,
                        icon: Bot,
                        context: { agentId: agent.id },
                      })
                    }
                  >
                    <Bot className="mr-2 h-4 w-4" />
                    <span>{agent.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {agent.role}
                    </span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup heading="Agents">
                <CommandItem
                  onSelect={() =>
                    handleSelect(() => navigate({ to: "/agents" }))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Go to Agents</span>
                </CommandItem>
              </CommandGroup>
            )}
          </>
        )}

        {/* ═══ AGENT SUB-PAGE (nested) ═══ */}
        {page.id.startsWith("agent:") &&
          renderAgentSubPage(page.context?.agentId ?? page.id.slice(6))}

        {/* ═══ APPEARANCE PAGE ═══ */}
        {page.id === "appearance" && (
          <CommandGroup heading="Appearance">
            <CommandItem
              onSelect={() => handleSelect(handleToggleTheme)}
            >
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              <span>
                Switch to {theme === "dark" ? "Light" : "Dark"} Theme
              </span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => setTheme("dark"))
              }
            >
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark Theme</span>
              {theme === "dark" && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => setTheme("light"))
              }
            >
              <Sun className="mr-2 h-4 w-4" />
              <span>Light Theme</span>
              {theme === "light" && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </CommandItem>
            <CommandSeparator />
            <CommandItem
              onSelect={() => handleSelect(handleTogglePowerUser)}
            >
              <Zap className="mr-2 h-4 w-4" />
              <span>
                {powerUserMode ? "Disable" : "Enable"} Power User Mode
              </span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleSelect(handleToggleSidebar)}
            >
              <PanelLeftClose className="mr-2 h-4 w-4" />
              <span>Toggle Sidebar</span>
            </CommandItem>
          </CommandGroup>
        )}

        {/* ═══ SETTINGS PAGE ═══ */}
        {page.id === "settings" && (
          <CommandGroup heading="Settings">
            <CommandItem
              onSelect={() =>
                handleSelect(() => navigate({ to: "/you" }))
              }
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Profile & Preferences</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => navigate({ to: "/settings" }))
              }
            >
              <Cog className="mr-2 h-4 w-4" />
              <span>Gateway Configuration</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => navigate({ to: "/nodes" }))
              }
            >
              <Monitor className="mr-2 h-4 w-4" />
              <span>Nodes & Devices</span>
            </CommandItem>
            {onShowShortcuts && (
              <CommandItem
                onSelect={() => handleSelect(onShowShortcuts)}
              >
                <Keyboard className="mr-2 h-4 w-4" />
                <span>Keyboard Shortcuts</span>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => handleSelect(handleTogglePowerUser)}
            >
              <Zap className="mr-2 h-4 w-4" />
              <span>
                {powerUserMode ? "Disable" : "Enable"} Power User Mode
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
