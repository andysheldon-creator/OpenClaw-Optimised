"use client";

import {
  Brain,
  Target,
  RefreshCw,
  Lightbulb,
  User,
  Link as LinkIcon,
  Settings,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppShell } from "@/components/navigation/app-shell";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    section: "Content",
    items: [
      {
        href: "/memories",
        icon: Brain,
        label: "Memories",
        description: "Your stored knowledge and context",
      },
      {
        href: "/goals",
        icon: Target,
        label: "Goals",
        description: "Track objectives and progress",
      },
      {
        href: "/rituals",
        icon: RefreshCw,
        label: "Rituals",
        description: "Scheduled agent check-ins",
      },
      {
        href: "/insights",
        icon: Lightbulb,
        label: "Insights",
        description: "Patterns and recommendations",
      },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/you", icon: User, label: "Profile", description: "Your personal preferences" },
      {
        href: "/connections",
        icon: LinkIcon,
        label: "Connections",
        description: "Linked apps and services",
      },
      { href: "/settings", icon: Settings, label: "Settings", description: "App configuration" },
      {
        href: "/help",
        icon: HelpCircle,
        label: "Help & Support",
        description: "Get help and documentation",
      },
    ],
  },
];

export default function MorePage() {
  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-2xl px-4 pb-24 md:px-6">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">More</h1>
            <p className="mt-1 text-muted-foreground">Additional features and settings</p>
          </div>

          {menuItems.map((section) => (
            <section key={section.section} className="mb-8">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 px-1">
                {section.section}
              </h2>
              <div className="rounded-xl border border-border bg-card shadow-soft overflow-hidden divide-y divide-border">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-4 p-4 transition-colors hover:bg-muted/50",
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.description}</div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </AppShell>
  );
}
