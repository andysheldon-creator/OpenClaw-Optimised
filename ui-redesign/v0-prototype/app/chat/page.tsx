"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { ConversationItem } from "@/components/chat/conversation-item";
import { AgentCard } from "@/components/dashboard/agent-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { AppShell } from "@/components/navigation/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const agents = [
  { id: "research", name: "Research Assistant", status: "ready" as const },
  { id: "writing", name: "Writing Partner", status: "ready" as const },
  { id: "scheduler", name: "Scheduler", status: "ready" as const },
];

const conversations = {
  active: [
    {
      id: "conv-1",
      agentId: "research",
      agentName: "Research Assistant",
      agentStatus: "active" as const,
      lastMessage: "Here's the competitor analysis you requested...",
      timestamp: "2m ago",
      isActive: true,
    },
    {
      id: "conv-2",
      agentId: "writing",
      agentName: "Writing Partner",
      agentStatus: "active" as const,
      lastMessage: "I've drafted the introduction section for your...",
      timestamp: "15m ago",
      isActive: true,
    },
  ],
  recent: [
    {
      id: "conv-3",
      agentId: "scheduler",
      agentName: "Scheduler",
      agentStatus: "ready" as const,
      lastMessage: "Your schedule for tomorrow has been optimized...",
      timestamp: "Yesterday",
      isActive: false,
    },
    {
      id: "conv-4",
      agentId: "research",
      agentName: "Research Assistant",
      agentStatus: "ready" as const,
      lastMessage: "The market analysis shows significant growth in...",
      timestamp: "2 days ago",
      isActive: false,
    },
  ],
};

export default function ConversationsPage() {
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <PageHeader userName="David" notificationCount={3} />

        <main className="mx-auto max-w-3xl px-4 pb-24 md:px-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-foreground">Conversations</h1>
            <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 rounded-xl">
                  <Plus className="h-4 w-4" />
                  New Chat
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Start a New Conversation</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground mb-4">Choose an agent to chat with:</p>
                <div className="grid grid-cols-2 gap-3">
                  {agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                  <AgentCard isCreateNew />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Active Conversations */}
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Active
            </h2>
            <div className="space-y-3">
              {conversations.active.map((conv) => (
                <ConversationItem key={conv.id} conversation={conv} />
              ))}
            </div>
          </section>

          {/* Recent Conversations */}
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent
            </h2>
            <div className="space-y-3">
              {conversations.recent.map((conv) => (
                <ConversationItem key={conv.id} conversation={conv} />
              ))}
            </div>
          </section>

          {/* Load More */}
          <div className="mt-6 text-center">
            <Button variant="ghost" className="text-muted-foreground">
              Load more...
            </Button>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
