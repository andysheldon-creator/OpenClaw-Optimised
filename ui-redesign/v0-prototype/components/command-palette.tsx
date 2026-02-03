"use client";

import {
  MessageSquare,
  Bot,
  Target,
  Brain,
  Home,
  Users,
  Settings,
  RefreshCw,
  FolderOpen,
  Link,
  User,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
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

interface CommandPaletteProps {
  onNewConversation?: () => void;
  onNewAgent?: () => void;
  onNewGoal?: () => void;
  onNewMemory?: () => void;
  onNewRitual?: () => void;
}

export function CommandPalette({
  onNewConversation,
  onNewAgent,
  onNewGoal,
  onNewMemory,
  onNewRitual,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => runCommand(() => onNewConversation?.() || router.push("/chat"))}
          >
            <MessageSquare className="size-4" />
            <span>New conversation</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNewAgent?.() || router.push("/agents"))}>
            <Bot className="size-4" />
            <span>Create new agent</span>
            <CommandShortcut>A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onNewGoal?.() || router.push("/goals"))}>
            <Target className="size-4" />
            <span>Add goal</span>
            <CommandShortcut>G</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNewMemory?.() || router.push("/memories"))}
          >
            <Brain className="size-4" />
            <span>Add memory</span>
            <CommandShortcut>M</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNewRitual?.() || router.push("/rituals"))}
          >
            <RefreshCw className="size-4" />
            <span>Create ritual</span>
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Recent */}
        <CommandGroup heading="Recent">
          <CommandItem onSelect={() => runCommand(() => router.push("/chat/research"))}>
            <MessageSquare className="size-4 text-chart-1" />
            <span>Chat with Research Assistant</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/workstreams/q1-launch"))}>
            <FolderOpen className="size-4 text-chart-2" />
            <span>Q1 Launch Prep workstream</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/agents/writing"))}>
            <Bot className="size-4 text-chart-3" />
            <span>Writing Partner settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <Home className="size-4" />
            <span>Go to Home</span>
            <CommandShortcut>1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/chat"))}>
            <MessageSquare className="size-4" />
            <span>Go to Chat</span>
            <CommandShortcut>2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/agents"))}>
            <Users className="size-4" />
            <span>Go to Agents</span>
            <CommandShortcut>3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/rituals"))}>
            <RefreshCw className="size-4" />
            <span>Go to Rituals</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/memories"))}>
            <Brain className="size-4" />
            <span>Go to Memories</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/goals"))}>
            <Target className="size-4" />
            <span>Go to Goals</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/you"))}>
            <User className="size-4" />
            <span>Go to Profile</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/connections"))}>
            <Link className="size-4" />
            <span>Go to Connections</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="size-4" />
            <span>Go to Settings</span>
            <CommandShortcut>,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// Hook to use the command palette from anywhere
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
