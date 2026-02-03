"use client";

import { X, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high";

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTasks: { id: string; name: string }[];
  onSubmit?: (task: TaskFormData) => void;
}

interface TaskFormData {
  title: string;
  description: string;
  dependencies: string[];
  priority: Priority;
}

export function AddTaskDialog({ open, onOpenChange, existingTasks, onSubmit }: AddTaskDialogProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    dependencies: [],
    priority: "medium",
  });
  const [depPopoverOpen, setDepPopoverOpen] = useState(false);

  const handleSubmit = () => {
    onSubmit?.(formData);
    onOpenChange(false);
    setFormData({
      title: "",
      description: "",
      dependencies: [],
      priority: "medium",
    });
  };

  const addDependency = (taskId: string) => {
    if (!formData.dependencies.includes(taskId)) {
      setFormData((prev) => ({
        ...prev,
        dependencies: [...prev.dependencies, taskId],
      }));
    }
    setDepPopoverOpen(false);
  };

  const removeDependency = (taskId: string) => {
    setFormData((prev) => ({
      ...prev,
      dependencies: prev.dependencies.filter((id) => id !== taskId),
    }));
  };

  const availableTasks = existingTasks.filter((t) => !formData.dependencies.includes(t.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="Create presentation slides"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Create slides for the team presentation based on the final report."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <Label>
              Depends On <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background p-2 min-h-[42px]">
              {formData.dependencies.map((depId) => {
                const task = existingTasks.find((t) => t.id === depId);
                return (
                  <Badge key={depId} variant="secondary" className="flex items-center gap-1">
                    {task?.name}
                    <button
                      type="button"
                      onClick={() => removeDependency(depId)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove</span>
                    </button>
                  </Badge>
                );
              })}
              <Popover open={depPopoverOpen} onOpenChange={setDepPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-muted-foreground"
                    disabled={availableTasks.length === 0}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add dependency
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-64" align="start">
                  <Command>
                    <CommandInput placeholder="Search tasks..." />
                    <CommandList>
                      <CommandEmpty>No tasks found.</CommandEmpty>
                      <CommandGroup>
                        {availableTasks.map((task) => (
                          <CommandItem key={task.id} onSelect={() => addDependency(task.id)}>
                            {task.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as Priority[]).map((priority) => (
                <Button
                  key={priority}
                  type="button"
                  variant={formData.priority === priority ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData((prev) => ({ ...prev, priority }))}
                  className={cn(
                    "capitalize flex-1",
                    formData.priority === priority &&
                      priority === "high" &&
                      "bg-destructive hover:bg-destructive/90",
                    formData.priority === priority &&
                      priority === "low" &&
                      "bg-success hover:bg-success/90",
                  )}
                >
                  {priority}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.title}>
            Add Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
