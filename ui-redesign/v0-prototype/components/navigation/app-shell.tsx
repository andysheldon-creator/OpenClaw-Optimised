"use client";

import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
