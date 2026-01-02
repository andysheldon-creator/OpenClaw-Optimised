import { describe, expect, it } from "vitest";
import {
  type ActionItem,
  extractActionItems,
  formatActionItems,
} from "./action-extractor.js";

describe("extractActionItems", () => {
  describe("explicit markers", () => {
    it("extracts ACTION: items", () => {
      const notes = `
        Meeting notes:
        ACTION: Review the Q4 budget proposal
        ACTION: Send updated timeline to stakeholders
      `;
      const items = extractActionItems(notes);
      expect(items).toHaveLength(2);
      expect(items[0].description).toBe("Review the Q4 budget proposal");
      expect(items[1].description).toBe(
        "Send updated timeline to stakeholders",
      );
    });

    it("extracts TODO: items", () => {
      const notes = "TODO: Fix the login bug";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe("Fix the login bug");
    });

    it("extracts TASK: items", () => {
      const notes = "TASK: Update documentation";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe("Update documentation");
    });

    it("handles bullet-prefixed markers", () => {
      const notes = "- ACTION: Complete the report";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe("Complete the report");
    });
  });

  describe("assignment patterns", () => {
    it("extracts '@person will' patterns", () => {
      const notes = "@John will prepare the presentation slides";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe("prepare the presentation slides");
      expect(items[0].assignee).toBe("John");
    });

    it("extracts 'person will' patterns without @", () => {
      const notes = "Sarah will schedule the follow-up meeting";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].assignee).toBe("Sarah");
    });

    it("extracts 'assigned to' patterns", () => {
      const notes = "assigned to Mike: Review the codebase";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].assignee).toBe("Mike");
      expect(items[0].description).toBe("Review the codebase");
    });

    it("extracts 'person should' patterns", () => {
      const notes = "Alice should update the design mockups";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].assignee).toBe("Alice");
    });

    it("extracts 'person needs to' patterns", () => {
      const notes = "Bob needs to fix the deployment script";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].assignee).toBe("Bob");
    });

    it("filters out false positive assignees", () => {
      const notes = "We will discuss this later";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(0);
    });
  });

  describe("deadline extraction", () => {
    it("extracts 'by [day]' deadlines", () => {
      const notes = "ACTION: Submit report by Friday";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("Friday");
    });

    it("extracts 'by tomorrow' deadlines", () => {
      const notes = "ACTION: Send email by tomorrow";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("tomorrow");
    });

    it("extracts 'by [date]' deadlines", () => {
      const notes = "ACTION: Complete project by Jan 15";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("Jan 15");
    });

    it("extracts 'due [day]' deadlines", () => {
      const notes = "ACTION: Review PR due Monday";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("Monday");
    });

    it("extracts 'deadline:' explicit format", () => {
      const notes = "ACTION: Deploy to production deadline: next week";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("next week");
    });

    it("extracts 'by end of week' deadlines", () => {
      const notes = "ACTION: Finish testing by end of week";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].deadline).toBe("end of week");
    });
  });

  describe("priority detection", () => {
    it("detects high priority from 'urgent'", () => {
      const notes = "ACTION: urgent fix for production bug";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("high");
    });

    it("detects high priority from 'ASAP'", () => {
      const notes = "ACTION: Review changes ASAP";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("high");
    });

    it("detects high priority from 'critical'", () => {
      const notes = "ACTION: Critical security patch needed";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("high");
    });

    it("detects low priority from 'nice to have'", () => {
      const notes = "ACTION: Add dark mode nice to have";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("low");
    });

    it("detects low priority from 'when possible'", () => {
      const notes = "ACTION: Update README when possible";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("low");
    });

    it("defaults to medium priority", () => {
      const notes = "ACTION: Review the documentation";
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("medium");
    });
  });

  describe("deduplication", () => {
    it("removes duplicate action items", () => {
      const notes = `
        ACTION: Review the code
        TODO: Review the code
      `;
      const items = extractActionItems(notes);
      expect(items).toHaveLength(1);
    });
  });

  describe("complex meeting notes", () => {
    it("extracts multiple items from realistic meeting notes", () => {
      const notes = `
        Sprint Planning Meeting - Jan 2, 2025

        Discussion Points:
        - Reviewed Q4 metrics
        - Discussed roadmap priorities

        Action Items:
        ACTION: @Sarah will prepare the Q1 roadmap presentation by Friday
        TODO: Review and merge pending PRs - urgent
        @Mike needs to update the API documentation by end of week
        assigned to Lisa: Schedule customer demo

        Notes:
        - Follow up on hiring next week
        - Team lunch on Thursday
      `;

      const items = extractActionItems(notes);
      expect(items.length).toBeGreaterThanOrEqual(4);

      // Check that Sarah's item was extracted
      const sarahItem = items.find((i) => i.assignee === "Sarah");
      expect(sarahItem).toBeDefined();
      expect(sarahItem?.deadline).toBe("Friday");

      // Check urgent item has high priority
      const urgentItem = items.find((i) => i.priority === "high");
      expect(urgentItem).toBeDefined();

      // Check Mike's item
      const mikeItem = items.find((i) => i.assignee === "Mike");
      expect(mikeItem).toBeDefined();
      expect(mikeItem?.deadline).toBe("end of week");

      // Check Lisa's item
      const lisaItem = items.find((i) => i.assignee === "Lisa");
      expect(lisaItem).toBeDefined();
    });
  });
});

describe("formatActionItems", () => {
  it("returns message when no items", () => {
    const result = formatActionItems([]);
    expect(result).toBe("No action items found.");
  });

  it("formats single item as markdown checklist", () => {
    const items: ActionItem[] = [
      {
        description: "Review the code",
        priority: "medium",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain("## Action Items");
    expect(result).toContain("- [ ] Review the code");
  });

  it("includes priority indicator for high priority", () => {
    const items: ActionItem[] = [
      {
        description: "Fix critical bug",
        priority: "high",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain("[HIGH]");
  });

  it("includes priority indicator for low priority", () => {
    const items: ActionItem[] = [
      {
        description: "Update docs",
        priority: "low",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain("[LOW]");
  });

  it("includes assignee with @ prefix", () => {
    const items: ActionItem[] = [
      {
        description: "Prepare slides",
        assignee: "John",
        priority: "medium",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain("@John");
  });

  it("includes deadline", () => {
    const items: ActionItem[] = [
      {
        description: "Submit report",
        deadline: "Friday",
        priority: "medium",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain("due: Friday");
  });

  it("sorts by priority (high first)", () => {
    const items: ActionItem[] = [
      { description: "Low task", priority: "low" },
      { description: "High task", priority: "high" },
      { description: "Medium task", priority: "medium" },
    ];
    const result = formatActionItems(items);
    const lines = result.split("\n").filter((l) => l.startsWith("- [ ]"));
    expect(lines[0]).toContain("High task");
    expect(lines[1]).toContain("Medium task");
    expect(lines[2]).toContain("Low task");
  });

  it("formats complete item with all fields", () => {
    const items: ActionItem[] = [
      {
        description: "Complete the report",
        assignee: "Sarah",
        deadline: "Monday",
        priority: "high",
      },
    ];
    const result = formatActionItems(items);
    expect(result).toContain(
      "- [ ] Complete the report ([HIGH] | @Sarah | due: Monday)",
    );
  });
});
