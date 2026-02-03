"use client";

import { ArrowLeft, Settings, ClipboardList, MoreVertical, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const agents: Record<string, { name: string; status: "active" | "ready" }> = {
  research: { name: "Research Assistant", status: "active" },
  writing: { name: "Writing Partner", status: "ready" },
  scheduler: { name: "Scheduler", status: "ready" },
};

const initialMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Can you research the top 5 competitors in the AI scheduling space?",
    timestamp: "2:34 PM",
  },
  {
    id: "2",
    role: "assistant" as const,
    content:
      "I'll research that for you. Let me search for information on AI scheduling competitors...\n\nBased on my research, here are the top 5 competitors:\n\n1. **Calendly AI** - Market leader with intelligent scheduling that learns from your preferences...\n\n2. **Motion** - AI-powered calendar that automatically schedules your tasks and meetings...\n\n3. **Reclaim.ai** - Smart calendar assistant that protects your focus time...\n\n4. **Clockwise** - Team calendar optimization with AI-powered scheduling...\n\n5. **x.ai** - AI meeting scheduler with natural language processing...",
    timestamp: "2:35 PM",
    agentName: "Research Assistant",
    agentStatus: "active" as const,
    toolCalls: [
      {
        id: "tool-1",
        name: "Web Search",
        status: "done" as const,
        input: '{\n  "query": "AI scheduling software competitors 2025",\n  "num_results": 10\n}',
        output:
          '{\n  "results": [\n    { "title": "Best AI Scheduling Tools 2025...", ... },\n    ...\n  ]\n}',
        duration: "1.2s",
      },
    ],
  },
];

const sessionTasks = [
  { id: "1", name: "Competitor Analysis", status: "running" as const, progress: 60 },
  { id: "2", name: "Initial Research", status: "done" as const },
  { id: "3", name: "Data Collection", status: "done" as const },
];

const toolCalls = [
  { id: "1", name: "Web Search", duration: "1.2s", status: "done" as const },
  { id: "2", name: "Read Document", duration: "0.8s", status: "done" as const },
  { id: "3", name: "Generate Report", status: "running" as const },
];

export default function ChatPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const agent = agents[agentId] || { name: "Unknown Agent", status: "ready" };

  const [messages, setMessages] = useState(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSend = (content: string) => {
    const newMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, newMessage]);

    // Simulate AI response
    setIsStreaming(true);
    setTimeout(() => {
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant" as const,
        content: "I'm processing your request. Let me analyze that for you...",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        agentName: agent.name,
        agentStatus: agent.status,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsStreaming(false);
    }, 1500);
  };

  const handleStop = () => {
    setIsStreaming(false);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl">
            <Link href="/chat" aria-label="Back to conversations">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <AgentAvatar name={agent.name} status={agent.status} size="sm" />
          <div>
            <h1 className="font-medium text-foreground">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">Session started 2:30 PM</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Settings */}
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Chat settings</span>
          </Button>

          {/* Task Panel */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                <ClipboardList className="h-5 w-5" />
                <span className="sr-only">Session tasks</span>
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Session Tasks</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Active Tasks */}
                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Active
                  </h3>
                  <div className="space-y-2">
                    {sessionTasks
                      .filter((t) => t.status === "running")
                      .map((task) => (
                        <div key={task.id} className="rounded-lg border border-border bg-card p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="font-medium text-sm">{task.name}</span>
                          </div>
                          {task.progress !== undefined && (
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Completed Tasks */}
                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Completed
                  </h3>
                  <div className="space-y-2">
                    {sessionTasks
                      .filter((t) => t.status === "done")
                      .map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
                        >
                          <Check className="h-4 w-4 text-success" />
                          <span className="text-sm">{task.name}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Tool Calls */}
                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tool Calls
                  </h3>
                  <div className="space-y-2">
                    {toolCalls.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex items-center gap-2">
                          {tool.status === "running" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <Check className="h-4 w-4 text-success" />
                          )}
                          <span className="text-sm">{tool.name}</span>
                        </div>
                        {tool.duration && (
                          <span className="text-xs text-muted-foreground">{tool.duration}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* More options */}
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">More options</span>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Session start indicator */}
          <div className="flex justify-center">
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Session started 2:30 PM
            </span>
          </div>

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex gap-3">
              <AgentAvatar name={agent.name} size="sm" status="active" className="mt-1" />
              <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} isStreaming={isStreaming} onStop={handleStop} />
    </div>
  );
}
