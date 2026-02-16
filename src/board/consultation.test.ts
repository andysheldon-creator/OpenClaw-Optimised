import { afterEach, describe, expect, it } from "vitest";

import {
  buildConsultationPrompt,
  cancelConsultation,
  cleanupTimedOutConsultations,
  clearAllConsultations,
  completeConsultation,
  createConsultation,
  formatConsultationResult,
  getActiveConsultations,
  getConsultation,
} from "./consultation.js";

afterEach(() => {
  clearAllConsultations();
});

describe("createConsultation", () => {
  it("creates a consultation request", () => {
    const request = createConsultation({
      fromAgent: "strategy",
      toAgent: "finance",
      question: "What's the budget impact?",
      depth: 0,
      maxDepth: 2,
    });
    expect(request).toBeDefined();
    expect(request?.fromAgent).toBe("strategy");
    expect(request?.toAgent).toBe("finance");
    expect(request?.question).toBe("What's the budget impact?");
    expect(request?.depth).toBe(0);
    expect(request?.id).toMatch(/^consult-/);
  });

  it("returns undefined when depth limit exceeded", () => {
    const request = createConsultation({
      fromAgent: "strategy",
      toAgent: "finance",
      question: "Check this",
      depth: 2,
      maxDepth: 2,
    });
    expect(request).toBeUndefined();
  });

  it("returns undefined when consulting self", () => {
    const request = createConsultation({
      fromAgent: "finance",
      toAgent: "finance",
      question: "Ask myself?",
      depth: 0,
      maxDepth: 2,
    });
    expect(request).toBeUndefined();
  });

  it("includes context when provided", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "research",
      question: "Market data?",
      context: "We're evaluating European expansion",
      depth: 0,
      maxDepth: 2,
    });
    expect(request?.context).toBe("We're evaluating European expansion");
  });

  it("includes meetingId when provided", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "finance",
      question: "Cost analysis",
      depth: 0,
      maxDepth: 2,
      meetingId: "meeting-abc",
    });
    expect(request?.meetingId).toBe("meeting-abc");
  });
});

describe("completeConsultation", () => {
  it("completes a consultation and removes from active", () => {
    const request = createConsultation({
      fromAgent: "strategy",
      toAgent: "finance",
      question: "Budget?",
      depth: 0,
      maxDepth: 2,
    });
    expect(request).toBeDefined();

    const response = completeConsultation(request?.id, "Budget is $100k");
    expect(response).toBeDefined();
    expect(response?.requestId).toBe(request?.id);
    expect(response?.fromAgent).toBe("finance");
    expect(response?.response).toBe("Budget is $100k");
    expect(response?.durationMs).toBeGreaterThanOrEqual(0);

    // Should be removed from active
    expect(getConsultation(request?.id)).toBeUndefined();
  });

  it("returns undefined for unknown request ID", () => {
    const response = completeConsultation("nonexistent", "Response");
    expect(response).toBeUndefined();
  });

  it("includes confidence and suggestConsult", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "research",
      question: "Data?",
      depth: 0,
      maxDepth: 2,
    });
    const response = completeConsultation(request?.id, "Here's the data", {
      confidence: 0.85,
      suggestConsult: "critic",
    });
    expect(response?.confidence).toBe(0.85);
    expect(response?.suggestConsult).toBe("critic");
  });
});

describe("cancelConsultation", () => {
  it("removes consultation from active tracking", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "finance",
      question: "Test",
      depth: 0,
      maxDepth: 2,
    });
    expect(cancelConsultation(request?.id)).toBe(true);
    expect(getConsultation(request?.id)).toBeUndefined();
  });

  it("returns false for unknown ID", () => {
    expect(cancelConsultation("nonexistent")).toBe(false);
  });
});

describe("getActiveConsultations", () => {
  it("returns all active consultations", () => {
    createConsultation({
      fromAgent: "general",
      toAgent: "finance",
      question: "A",
      depth: 0,
      maxDepth: 2,
    });
    createConsultation({
      fromAgent: "general",
      toAgent: "research",
      question: "B",
      depth: 0,
      maxDepth: 2,
    });
    expect(getActiveConsultations()).toHaveLength(2);
  });
});

describe("cleanupTimedOutConsultations", () => {
  it("cleans up timed-out consultations", async () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "finance",
      question: "Test",
      depth: 0,
      maxDepth: 2,
      timeoutMs: 1, // 1ms timeout — will expire almost immediately
    });
    expect(request).toBeDefined();

    // Wait for the timeout to pass
    await new Promise((r) => setTimeout(r, 10));
    const cleaned = cleanupTimedOutConsultations();
    expect(cleaned).toBe(1);
    expect(getActiveConsultations()).toHaveLength(0);
  });
});

describe("buildConsultationPrompt", () => {
  it("includes the question", () => {
    const request = createConsultation({
      fromAgent: "strategy",
      toAgent: "finance",
      question: "What's the ROI?",
      depth: 0,
      maxDepth: 2,
    });
    expect(request).toBeDefined();
    const prompt = buildConsultationPrompt(
      request as NonNullable<typeof request>,
    );
    expect(prompt).toContain("What's the ROI?");
    expect(prompt).toContain("strategy");
  });

  it("includes context when provided", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "research",
      question: "Market data?",
      context: "European expansion project",
      depth: 0,
      maxDepth: 2,
    });
    expect(request).toBeDefined();
    const prompt = buildConsultationPrompt(
      request as NonNullable<typeof request>,
    );
    expect(prompt).toContain("European expansion project");
    expect(prompt).toContain("Context");
  });

  it("labels meeting consultations differently", () => {
    const request = createConsultation({
      fromAgent: "general",
      toAgent: "finance",
      question: "Budget?",
      depth: 0,
      maxDepth: 2,
      meetingId: "meeting-abc",
    });
    expect(request).toBeDefined();
    const prompt = buildConsultationPrompt(
      request as NonNullable<typeof request>,
    );
    expect(prompt).toContain("Board Meeting Consultation");
  });
});

describe("formatConsultationResult", () => {
  it("formats response with agent name", () => {
    const result = formatConsultationResult({
      requestId: "req-1",
      fromAgent: "finance",
      response: "Budget is $50k",
      durationMs: 1500,
    });
    expect(result).toContain("finance");
    expect(result).toContain("Budget is $50k");
    expect(result).toContain("1500ms");
  });

  it("includes confidence when provided", () => {
    const result = formatConsultationResult({
      requestId: "req-1",
      fromAgent: "research",
      response: "Data shows growth",
      confidence: 0.9,
      durationMs: 1000,
    });
    expect(result).toContain("90%");
  });

  it("includes suggest-consult when provided", () => {
    const result = formatConsultationResult({
      requestId: "req-1",
      fromAgent: "finance",
      response: "Numbers look good",
      suggestConsult: "critic",
      durationMs: 800,
    });
    expect(result).toContain("critic");
  });
});
