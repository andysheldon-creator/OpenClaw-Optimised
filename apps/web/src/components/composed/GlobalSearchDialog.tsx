"use client";

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Bot,
  MessageCircle,
  Target,
  Clock,
  Brain,
  Compass,
  X,
  ArrowRight,
  Loader2,
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
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useGlobalSearch,
  CATEGORY_META,
  type SearchCategory,
  type SearchResult,
} from "@/hooks/useGlobalSearch";

// ─── Category Icons ─────────────────────────────────────────────

const CATEGORY_ICONS: Record<SearchCategory, LucideIcon> = {
  navigation: Compass,
  agent: Bot,
  session: MessageCircle,
  goal: Target,
  decision: Clock,
  cron: Clock,
  memory: Brain,
};

// ─── Props ──────────────────────────────────────────────────────

export interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────

/**
 * Global search dialog powered by useGlobalSearch.
 *
 * Opens with Cmd+Shift+F (or Ctrl+Shift+F on Windows/Linux).
 * Provides a Spotlight-style search across agents, sessions, goals,
 * decisions, cron jobs, memories, and navigation pages.
 *
 * Features:
 * - Fuzzy search across all domains
 * - Category-grouped results with icons
 * - Category filter chips
 * - Keyboard navigation (up/down/enter)
 * - Recent searches (persisted to localStorage)
 * - Score-based ranking
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<SearchCategory | null>(
    null,
  );
  const [recentSearches, setRecentSearches] = React.useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("cb:recent-searches") ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });

  const { grouped, isEmpty, isSearching, totalCount } =
    useGlobalSearch(query, {
      maxPerCategory: 8,
      maxTotal: 30,
      categories: activeFilter ? [activeFilter] : undefined,
      debounceMs: 150,
    });

  // Clear state when dialog closes
  React.useEffect(() => {
    if (!open) {
      // Small delay so the close animation isn't janky
      const timer = setTimeout(() => {
        setQuery("");
        setActiveFilter(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSelect = React.useCallback(
    (result: SearchResult) => {
      // Save to recent searches
      const updated = [
        result.title,
        ...recentSearches.filter((s) => s !== result.title),
      ].slice(0, 8);
      setRecentSearches(updated);
      try {
        localStorage.setItem("cb:recent-searches", JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }

      onOpenChange(false);

      if (result.route) {
        navigate({ to: result.route });
      }
    },
    [navigate, onOpenChange, recentSearches],
  );

  const handleRecentSelect = React.useCallback(
    (term: string) => {
      setQuery(term);
    },
    [],
  );

  const clearRecentSearches = React.useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem("cb:recent-searches");
    } catch {
      // Ignore
    }
  }, []);

  const toggleFilter = React.useCallback(
    (category: SearchCategory) => {
      setActiveFilter((prev) => (prev === category ? null : category));
    },
    [],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center border-b px-3 py-1">
        <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <CommandInput
          placeholder="Search everywhere..."
          value={query}
          onValueChange={setQuery}
          className="flex-1"
        />
        {isSearching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="ml-1 rounded-sm p-1 hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
        {(Object.keys(CATEGORY_META) as SearchCategory[])
          .sort(
            (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order,
          )
          .map((cat) => {
            const meta = CATEGORY_META[cat];
            const isActive = activeFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleFilter(cat)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
      </div>

      <CommandList className="max-h-[400px]">
        {/* Results count */}
        {query.length >= 2 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground">
            {totalCount} result{totalCount !== 1 ? "s" : ""}
            {activeFilter && (
              <>
                {" "}
                in{" "}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {CATEGORY_META[activeFilter].label}
                </Badge>
              </>
            )}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-6">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </p>
              {activeFilter && (
                <button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className="text-xs text-primary hover:underline"
                >
                  Search all categories
                </button>
              )}
            </div>
          </CommandEmpty>
        )}

        {/* Grouped results */}
        {grouped.map((group, gi) => {
          const CategoryIcon = CATEGORY_ICONS[group.category];
          return (
            <React.Fragment key={group.category}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    {CategoryIcon && (
                      <CategoryIcon className="h-3.5 w-3.5" />
                    )}
                    {group.label}
                    <Badge
                      variant="outline"
                      className="ml-1 text-[10px] px-1 py-0"
                    >
                      {group.items.length}
                    </Badge>
                  </span>
                }
              >
                {group.items.map((result) => (
                  <SearchResultItem
                    key={result.id}
                    result={result}
                    onSelect={() => handleSelect(result)}
                  />
                ))}
              </CommandGroup>
            </React.Fragment>
          );
        })}

        {/* Recent searches (when no query) */}
        {!query && recentSearches.length > 0 && (
          <CommandGroup
            heading={
              <span className="flex items-center justify-between">
                <span>Recent Searches</span>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </span>
            }
          >
            {recentSearches.map((term) => (
              <CommandItem
                key={`recent:${term}`}
                value={term}
                onSelect={() => handleRecentSelect(term)}
                className="gap-2"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{term}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Placeholder when no query and no recents */}
        {!query && recentSearches.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Search className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Search agents, sessions, goals, and more...
            </p>
            <p className="text-xs text-muted-foreground/60">
              Type at least 2 characters to search
            </p>
          </div>
        )}
      </CommandList>

      {/* Footer with keyboard hints */}
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">
              ↑↓
            </kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">
              ↵
            </kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">
              Esc
            </kbd>
            Close
          </span>
        </div>
        <span>⌘⇧F to search</span>
      </div>
    </CommandDialog>
  );
}

// ─── Search Result Item ─────────────────────────────────────────

function SearchResultItem({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[result.category];

  return (
    <CommandItem
      value={`${result.category}:${result.title}`}
      onSelect={onSelect}
      className="group flex items-center gap-3 px-3 py-2"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        {CategoryIcon && (
          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{result.title}</span>
          {result.meta?.status != null && (
            <Badge
              variant="outline"
              className="text-[10px] px-1 py-0 shrink-0"
            >
              {String(result.meta.status)}
            </Badge>
          )}
        </div>
        {result.subtitle && (
          <p className="truncate text-xs text-muted-foreground">
            {result.subtitle}
          </p>
        )}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-aria-selected:opacity-100 transition-opacity" />
    </CommandItem>
  );
}

// ─── Hook: Global Search Keyboard Shortcut ──────────────────────

/**
 * Hook to manage the global search dialog state and keyboard shortcut.
 * Call this once in your app root to register Cmd+Shift+F / Ctrl+Shift+F.
 */
export function useGlobalSearchDialog() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+Shift+F or Ctrl+Shift+F
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default GlobalSearchDialog;
