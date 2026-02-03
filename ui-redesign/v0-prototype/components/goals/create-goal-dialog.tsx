"use client";

import { Target, Plus, X, Calendar, Flag, Users, Milestone } from "lucide-react";
import { useState } from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const agents = [
  { id: "research", name: "Research Assistant" },
  { id: "writing", name: "Writing Partner" },
  { id: "scheduler", name: "Scheduler" },
  { id: "all", name: "All Agents" },
];

interface CreateGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGoalDialog({ open, onOpenChange }: CreateGoalDialogProps) {
  const [step, setStep] = useState(1);
  const [milestones, setMilestones] = useState<string[]>([]);
  const [newMilestone, setNewMilestone] = useState("");

  const addMilestone = () => {
    if (newMilestone.trim()) {
      setMilestones([...milestones, newMilestone.trim()]);
      setNewMilestone("");
    }
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setStep(1);
    setMilestones([]);
    setNewMilestone("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Create New Goal</DialogTitle>
              <DialogDescription>Define what you want to achieve</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 py-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            1
          </div>
          <div className={cn("h-0.5 flex-1", step >= 2 ? "bg-primary" : "bg-muted")} />
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            2
          </div>
          <div className={cn("h-0.5 flex-1", step >= 3 ? "bg-primary" : "bg-muted")} />
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
              step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            3
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="goal-name" className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Goal Name
              </Label>
              <Input id="goal-name" placeholder="e.g., Launch Podcast by Q1" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-description" className="flex items-center gap-2">
                What does success look like?
              </Label>
              <Textarea
                id="goal-description"
                placeholder="e.g., Launch my first podcast episode on Spotify, Apple Podcasts, and YouTube by end of Q1"
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Be specific about the outcome you want to achieve
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  Priority
                </Label>
                <Select defaultValue="medium">
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        High Priority
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-warning" />
                        Medium
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                        Low
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Target Date
                </Label>
                <Input type="date" className="h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Primary Agent
              </Label>
              <Select>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select an agent to own this goal" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <AgentAvatar name={agent.name} size="sm" />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 py-4">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Milestone className="h-4 w-4 text-muted-foreground" />
                Key Milestones
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Break your goal into checkpoints to track progress
              </p>

              {/* Added milestones */}
              <div className="space-y-2">
                {milestones.map((milestone, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    <span className="flex-1 text-sm">{milestone}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMilestone(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add milestone input */}
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Define podcast concept"
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMilestone();
                    }
                  }}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMilestone}
                  disabled={!newMilestone.trim()}
                  className="h-10 px-3 bg-transparent"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {milestones.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
                <Milestone className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No milestones added yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Milestones help you track progress toward your goal
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={handleClose}>Create Goal</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
