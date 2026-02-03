"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SectionHeader } from "@/components/dashboard/section-header";
import { AppShell } from "@/components/navigation/app-shell";
import { CreateRitualDialog } from "@/components/rituals/create-ritual-dialog";
import { RitualCard } from "@/components/rituals/ritual-card";
import { Button } from "@/components/ui/button";

// Mock data
const todayRituals = [
  {
    id: "1",
    name: "Daily Standup",
    agentName: "Research Assistant",
    agentColor: "#e07a5f",
    prompt: "Give me a summary of what you're working on",
    time: "in 2 hours",
    status: "upcoming" as const,
  },
  {
    id: "2",
    name: "End of Day Summary",
    agentName: "All Agents",
    agentColor: "#81b29a",
    prompt: "Summarize today's progress and tomorrow's priorities",
    time: "at 6:00 PM",
    status: "upcoming" as const,
  },
];

const upcomingRituals = [
  {
    id: "3",
    name: "Weekly Review",
    agentName: "Research Assistant",
    agentColor: "#e07a5f",
    prompt: "Let's review this week's accomplishments and plan next week",
    time: "Monday 9:00 AM",
    status: "upcoming" as const,
  },
  {
    id: "4",
    name: "Content Calendar Check",
    agentName: "Writing Partner",
    agentColor: "#3d5a80",
    prompt: "Review and update the content calendar for the coming week",
    time: "Friday 2:00 PM",
    status: "upcoming" as const,
  },
];

const pausedRituals = [
  {
    id: "5",
    name: "Monthly Retrospective",
    agentName: "All Agents",
    agentColor: "#81b29a",
    prompt: "Conduct a monthly review of all completed work and learnings",
    time: "Last of month",
    status: "paused" as const,
  },
];

export default function RitualsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-4xl px-4 pb-24 md:px-6">
          {/* Page Title */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Rituals</h1>
              <p className="mt-1 text-muted-foreground">Scheduled check-ins with your agents</p>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              New Ritual
            </Button>
          </div>

          {/* Today's Rituals */}
          <section className="mb-10">
            <SectionHeader title="Today" />
            <div className="space-y-3">
              {todayRituals.map((ritual) => (
                <RitualCard
                  key={ritual.id}
                  {...ritual}
                  onSkip={() => {}}
                  onEdit={() => {}}
                  onPause={() => {}}
                />
              ))}
            </div>
          </section>

          {/* Upcoming Rituals */}
          <section className="mb-10">
            <SectionHeader title="Upcoming" />
            <div className="space-y-3">
              {upcomingRituals.map((ritual) => (
                <RitualCard key={ritual.id} {...ritual} onEdit={() => {}} onPause={() => {}} />
              ))}
            </div>
          </section>

          {/* Paused Rituals */}
          {pausedRituals.length > 0 && (
            <section>
              <SectionHeader title="Paused" />
              <div className="space-y-3">
                {pausedRituals.map((ritual) => (
                  <RitualCard key={ritual.id} {...ritual} onResume={() => {}} onEdit={() => {}} />
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Create Ritual Dialog */}
        <CreateRitualDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          onSubmit={(data) => {
            console.log("New ritual:", data);
          }}
        />
      </div>
    </AppShell>
  );
}
