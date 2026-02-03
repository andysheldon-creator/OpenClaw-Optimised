"use client";

import {
  Home,
  MessageSquare,
  Bot,
  Brain,
  Target,
  RefreshCw,
  Lightbulb,
  Settings,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/chat", icon: MessageSquare, label: "Conversations" },
  { href: "/agents", icon: Bot, label: "Agents" },
];

const secondaryNavItems = [
  { href: "/memories", icon: Brain, label: "Memories" },
  { href: "/goals", icon: Target, label: "Goals" },
  { href: "/rituals", icon: RefreshCw, label: "Rituals" },
  { href: "/insights", icon: Lightbulb, label: "Insights" },
];

const bottomNavItems = [
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "/help", icon: HelpCircle, label: "Help" },
];

interface SidebarNavProps {
  className?: string;
}

export function SidebarNav({ className }: SidebarNavProps) {
  const pathname = usePathname();

  const NavLink = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: typeof Home;
    label: string;
  }) => {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
        {label}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "hidden md:flex h-screen w-64 flex-col border-r border-border bg-sidebar p-4",
        className,
      )}
    >
      {/* Logo */}
      <div className="mb-6 px-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground">Second Brain</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1">
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div className="my-4 border-t border-border" />

        <div className="space-y-1">
          {secondaryNavItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="space-y-1 border-t border-border pt-4">
        {bottomNavItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </div>
    </aside>
  );
}
