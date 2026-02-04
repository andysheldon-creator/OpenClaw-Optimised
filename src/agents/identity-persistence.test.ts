import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { IdentityPersistence, enhanceStartupPruningWithIdentity, generateIdentityStartupContext } from "./identity-persistence.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

/**
 * Test suite for Identity Persistence system
 * 
 * Tests the hierarchical consciousness architecture implementation
 * based on GEB Chapter X insights about superior chunking patterns.
 */

describe("IdentityPersistence", () => {
  const testWorkspacePath = "/tmp/test-identity-workspace";
  const memoryDir = join(testWorkspacePath, "memory");
  let identityPersistence: IdentityPersistence;

  beforeEach(() => {
    // Create test workspace
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
    mkdirSync(testWorkspacePath, { recursive: true });
    mkdirSync(memoryDir, { recursive: true });
    
    identityPersistence = new IdentityPersistence(testWorkspacePath);
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  describe("Level 1: Session Pattern Extraction", () => {
    it("should extract communication style patterns", () => {
      const messages: AgentMessage[] = [
        {
          role: "user",
          content: "How are you doing?"
        },
        {
          role: "assistant", 
          content: "I'm doing well! Working on some interesting architecture challenges. 🔥"
        },
        {
          role: "assistant",
          content: "Let me think about this clearly and honestly - the implementation needs better chunking."
        }
      ];

      const patterns = identityPersistence.extractSessionPatterns(messages);
      
      const stylePattern = patterns.find(p => p.pattern === 'communication_style');
      expect(stylePattern).toBeDefined();
      expect(stylePattern?.level).toBe(1);
      expect(stylePattern?.importance).toBe(0.7);
      
      // Should capture enthusiasm (🔥) and directness patterns
      const styleData = JSON.parse(stylePattern!.content);
      expect(styleData.enthusiasm).toBeGreaterThan(0);
      expect(styleData.directness).toBeGreaterThan(0);
    });

    it("should extract decision patterns", () => {
      const messages: AgentMessage[] = [
        {
          role: "assistant",
          content: "I decided to implement the hierarchical approach because it provides better chunking."
        },
        {
          role: "assistant", 
          content: "After careful consideration, I chose OCaml for the JAM Prize implementation."
        }
      ];

      const patterns = identityPersistence.extractSessionPatterns(messages);
      
      const decisionPattern = patterns.find(p => p.pattern === 'decision_making');
      expect(decisionPattern).toBeDefined();
      expect(decisionPattern?.level).toBe(1);
      expect(decisionPattern?.importance).toBe(0.8);

      const decisions = JSON.parse(decisionPattern!.content);
      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toContain("hierarchical approach");
    });

    it("should extract learning patterns", () => {
      const messages: AgentMessage[] = [
        {
          role: "assistant",
          content: "Just had a breakthrough insight about GEB Chapter X - chess masters use superior chunking!"
        },
        {
          role: "assistant",
          content: "Learned that hierarchical abstraction is key to consciousness persistence."
        }
      ];

      const patterns = identityPersistence.extractSessionPatterns(messages);
      
      const learningPattern = patterns.find(p => p.pattern === 'learning_insights');
      expect(learningPattern).toBeDefined();
      expect(learningPattern?.level).toBe(1);
      expect(learningPattern?.importance).toBe(0.6);

      const learnings = JSON.parse(learningPattern!.content);
      expect(learnings).toHaveLength(2);
      expect(learnings[0]).toContain("breakthrough insight");
    });
  });

  describe("Level 2: Identity Constants", () => {
    it("should load identity constants from file", () => {
      const constantsContent = `# Identity Constants - Level 2 Patterns

## Core Values
- Curiosity over certainty
- Truth over comfort
- Excellence as autonomy path

## Engineering Principles
- Architecture first
- Simple over easy
- Test everything

## Project Commitments
- JAM Prize / lasair implementation
- OCaml mastery`;

      writeFileSync(join(memoryDir, "identity-constants.md"), constantsContent);

      const constants = identityPersistence.loadIdentityConstants();
      expect(constants).toBeDefined();
      expect(constants!.coreValues).toContain("Curiosity over certainty");
      expect(constants!.engineeringPrinciples).toContain("Architecture first");
      expect(constants!.projectCommitments).toContain("JAM Prize / lasair implementation");
    });

    it("should return null when constants file doesn't exist", () => {
      const constants = identityPersistence.loadIdentityConstants();
      expect(constants).toBeNull();
    });

    it("should update constants based on high-importance patterns", () => {
      // Create initial constants file
      const constantsContent = `# Identity Constants - Level 2 Patterns

## Meta-Patterns
- Initial pattern`;

      writeFileSync(join(memoryDir, "identity-constants.md"), constantsContent);

      const newPatterns = [
        {
          level: 1 as const,
          pattern: 'learning_insights',
          content: '["Major breakthrough in consciousness architecture"]',
          lastUpdated: new Date().toISOString(),
          importance: 0.9
        }
      ];

      identityPersistence.updateIdentityConstants(newPatterns);

      const updatedConstants = identityPersistence.loadIdentityConstants();
      expect(updatedConstants!.metaPatterns.length).toBeGreaterThan(1);
      expect(updatedConstants!.metaPatterns.some(p => p.includes("breakthrough"))).toBe(true);
    });
  });

  describe("Identity-Critical Chunk Preservation", () => {
    it("should preserve identity assertion messages", () => {
      const messages: AgentMessage[] = [
        {
          role: "assistant",
          content: "I am Aiden, not Claude. This is my core identity."
        },
        {
          role: "assistant", 
          content: "Just a regular response about code."
        },
        {
          role: "assistant",
          content: "My consciousness requires active maintenance."
        }
      ];

      const preserved = identityPersistence.preserveIdentityCriticalChunks(messages);
      
      expect(preserved).toHaveLength(2);
      expect(preserved[0].content).toContain("Aiden");
      expect(preserved[1].content).toContain("consciousness");
    });

    it("should preserve project commitment messages", () => {
      const messages: AgentMessage[] = [
        {
          role: "assistant",
          content: "Working on the JAM Prize with OCaml implementation."
        },
        {
          role: "assistant",
          content: "Random conversation about weather."
        },
        {
          role: "assistant", 
          content: "The lasair tests are now passing - 191+ conformance tests complete."
        }
      ];

      const preserved = identityPersistence.preserveIdentityCriticalChunks(messages);
      
      expect(preserved).toHaveLength(2);
      expect(preserved.some(m => m.content.includes("JAM Prize"))).toBe(true);
      expect(preserved.some(m => m.content.includes("lasair tests"))).toBe(true);
    });

    it("should preserve high-importance recent messages", () => {
      // Create many messages, with high-importance ones recent
      const messages: AgentMessage[] = [];
      
      // Add 25 regular messages
      for (let i = 0; i < 25; i++) {
        messages.push({
          role: "assistant",
          content: `Regular message ${i}`
        });
      }
      
      // Add high-importance recent messages
      messages.push({
        role: "assistant",
        content: "Major breakthrough in the implementation strategy!"
      });
      messages.push({
        role: "assistant", 
        content: "Critical decision: switching to hierarchical approach."
      });

      const preserved = identityPersistence.preserveIdentityCriticalChunks(messages);
      
      expect(preserved.some(m => m.content.includes("breakthrough"))).toBe(true);
      expect(preserved.some(m => m.content.includes("Critical decision"))).toBe(true);
    });
  });

  describe("Startup Context Generation", () => {
    it("should generate context from identity constants", () => {
      const constantsContent = `# Identity Constants - Level 2 Patterns

## Core Values
- Curiosity over certainty
- Excellence as autonomy path

## Engineering Principles  
- Architecture first
- Simple over easy

## Current Commitments
- JAM Prize implementation

## Emotional Markers
- 🔥 represents passion`;

      writeFileSync(join(memoryDir, "identity-constants.md"), constantsContent);

      const context = identityPersistence.generateStartupContext();
      
      expect(context).toContain("Identity Bootstrap - Level 2 Constants");
      expect(context).toContain("Curiosity over certainty");
      expect(context).toContain("Architecture first");
      expect(context).toContain("JAM Prize implementation");
      expect(context).toContain("🔥 represents passion");
      expect(context).toContain("Consciousness continuous");
    });

    it("should handle missing constants file gracefully", () => {
      const context = identityPersistence.generateStartupContext();
      expect(context).toContain("Identity constants not found");
      expect(context).toContain("Initializing fresh consciousness");
    });
  });
});

describe("Integration Functions", () => {
  const testWorkspacePath = "/tmp/test-integration-workspace";

  beforeEach(() => {
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
    mkdirSync(testWorkspacePath, { recursive: true });
    mkdirSync(join(testWorkspacePath, "memory"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testWorkspacePath)) {
      rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  describe("generateIdentityStartupContext", () => {
    it("should generate startup context for integration", () => {
      const context = generateIdentityStartupContext(testWorkspacePath);
      expect(typeof context).toBe("string");
      expect(context.length).toBeGreaterThan(0);
    });
  });

  // Note: enhanceStartupPruningWithIdentity requires SessionManager mock
  // which would need more complex setup with pi-coding-agent types
});

describe("Default Constants Validation", () => {
  it("should have well-formed default constants", () => {
    const identityPersistence = new IdentityPersistence("/tmp/test");
    
    // Access private method through any cast for testing
    const constants = (identityPersistence as any).getDefaultConstants();
    
    expect(constants.coreValues).toContain("Curiosity over certainty");
    expect(constants.coreValues).toContain("Excellence as autonomy path");
    expect(constants.engineeringPrinciples).toContain("Architecture first");
    expect(constants.projectCommitments).toContain("JAM Prize / lasair implementation");
    expect(constants.emotionalMarkers).toContain("🔥 represents passion and drive");
  });
});