"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

type Frequency = "daily" | "weekly" | "monthly" | "custom";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const daysOfWeek: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const timeOptions = [
  "6:00 AM",
  "6:30 AM",
  "7:00 AM",
  "7:30 AM",
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM",
  "8:30 PM",
  "9:00 PM",
  "9:30 PM",
  "10:00 PM",
];

const agents = [
  { id: "1", name: "Research Assistant" },
  { id: "2", name: "Writing Partner" },
  { id: "3", name: "Scheduler" },
  { id: "all", name: "All Agents" },
];

interface CreateRitualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (ritual: RitualFormData) => void;
}

interface RitualFormData {
  name: string;
  prompt: string;
  agentId: string;
  frequency: Frequency;
  selectedDays: DayOfWeek[];
  time: string;
  deliveryMethods: {
    chat: boolean;
    whatsapp: boolean;
    telegram: boolean;
    email: boolean;
  };
}

export function CreateRitualDialog({ open, onOpenChange, onSubmit }: CreateRitualDialogProps) {
  const [formData, setFormData] = useState<RitualFormData>({
    name: "",
    prompt: "",
    agentId: "",
    frequency: "daily",
    selectedDays: ["mon", "fri"],
    time: "9:00 AM",
    deliveryMethods: {
      chat: true,
      whatsapp: false,
      telegram: false,
      email: false,
    },
  });

  const handleSubmit = () => {
    onSubmit?.(formData);
    onOpenChange(false);
    // Reset form
    setFormData({
      name: "",
      prompt: "",
      agentId: "",
      frequency: "daily",
      selectedDays: ["mon", "fri"],
      time: "9:00 AM",
      deliveryMethods: {
        chat: true,
        whatsapp: false,
        telegram: false,
        email: false,
      },
    });
  };

  const toggleDay = (day: DayOfWeek) => {
    setFormData((prev) => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter((d) => d !== day)
        : [...prev.selectedDays, day],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Ritual</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ritual-name">Name</Label>
            <Input
              id="ritual-name"
              placeholder="Morning Planning"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="ritual-prompt">
              Prompt{" "}
              <span className="text-muted-foreground font-normal">(what the agent does)</span>
            </Label>
            <Textarea
              id="ritual-prompt"
              placeholder="Review my calendar for today and suggest how I should prioritize my tasks..."
              rows={3}
              value={formData.prompt}
              onChange={(e) => setFormData((prev) => ({ ...prev, prompt: e.target.value }))}
            />
          </div>

          {/* Agent */}
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select
              value={formData.agentId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, agentId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Section */}
          <div className="space-y-4">
            <Label className="text-base">Schedule</Label>

            {/* Frequency */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Frequency</Label>
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekly", "monthly", "custom"] as Frequency[]).map((freq) => (
                  <Button
                    key={freq}
                    type="button"
                    variant={formData.frequency === freq ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, frequency: freq }))}
                    className="capitalize"
                  >
                    {freq}
                  </Button>
                ))}
              </div>
            </div>

            {/* Days (for weekly) */}
            {formData.frequency === "weekly" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Days</Label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={formData.selectedDays.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                      className={cn(
                        "w-12",
                        formData.selectedDays.includes(day.value) &&
                          "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Time</Label>
                <span className="text-xs text-muted-foreground">Timezone: PST</span>
              </div>
              <Select
                value={formData.time}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, time: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <Label>Delivery</Label>
            <div className="space-y-2">
              {[
                { key: "chat" as const, label: "Chat in app" },
                { key: "whatsapp" as const, label: "Send via WhatsApp" },
                { key: "telegram" as const, label: "Send via Telegram" },
                { key: "email" as const, label: "Send via Email" },
              ].map((method) => (
                <div key={method.key} className="flex items-center gap-3">
                  <Checkbox
                    id={`delivery-${method.key}`}
                    checked={formData.deliveryMethods[method.key]}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        deliveryMethods: {
                          ...prev.deliveryMethods,
                          [method.key]: checked === true,
                        },
                      }))
                    }
                  />
                  <Label
                    htmlFor={`delivery-${method.key}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {method.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.prompt || !formData.agentId}
          >
            Create Ritual
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
