import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillPermissionManifest, PermissionValidationResult } from "./types.js";
import { validatePermissionManifest } from "./permissions.js";
import type { SkillsSecurityConfig } from "../../config/types.skills.js";

describe("Security Policy - Risk Assessment Integration", () => {
  describe("validatePermissionManifest risk levels", () => {
    it("should return 'high' risk for skills without manifest", () => {
      const result = validatePermissionManifest(undefined, "test-skill");
      expect(result.risk_level).toBe("high");
      expect(result.valid).toBe(false);
    });

    it("should return 'critical' for elevated access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        elevated: true,
        declared_purpose: "Admin tool",
      };
      const result = validatePermissionManifest(manifest, "admin-skill");
      expect(result.risk_level).toBe("critical");
    });

    it("should return 'critical' for shell executables", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        exec: ["bash"],
        declared_purpose: "Script runner",
      };
      const result = validatePermissionManifest(manifest, "script-skill");
      expect(result.risk_level).toBe("critical");
    });

    it("should return 'high' for credential access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        sensitive_data: { credentials: true },
        declared_purpose: "Password manager",
      };
      const result = validatePermissionManifest(manifest, "password-skill");
      expect(result.risk_level).toBe("high");
    });

    it("should return 'moderate' for single risk factor", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        env: ["AWS_ACCESS_KEY_ID"],
        declared_purpose: "AWS tool",
      };
      const result = validatePermissionManifest(manifest, "aws-skill");
      expect(result.risk_level).toBe("moderate");
      expect(result.risk_factors.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 'low' for network-only access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        network: ["api.safe-service.com"],
        declared_purpose: "API client",
      };
      const result = validatePermissionManifest(manifest, "api-skill");
      expect(result.risk_level).toBe("low");
    });

    it("should return 'minimal' for no permissions", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        declared_purpose: "Pure computation",
      };
      const result = validatePermissionManifest(manifest, "compute-skill");
      expect(result.risk_level).toBe("minimal");
    });
  });

  describe("High-risk pattern detection", () => {
    it("should flag SSH directory access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        filesystem: ["read:~/.ssh"],
        declared_purpose: "SSH key reader",
      };
      const result = validatePermissionManifest(manifest, "ssh-skill");
      expect(result.risk_factors.some((f) => f.includes(".ssh"))).toBe(true);
    });

    it("should flag .env file access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        filesystem: ["read:./.env"],
        declared_purpose: "Env reader",
      };
      const result = validatePermissionManifest(manifest, "env-skill");
      expect(result.risk_factors.some((f) => f.includes(".env"))).toBe(true);
    });

    it("should flag wildcard network access", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        network: ["any"],
        declared_purpose: "Universal client",
      };
      const result = validatePermissionManifest(manifest, "universal-skill");
      expect(result.risk_factors.some((f) => f.includes("any"))).toBe(true);
    });

    it("should flag known exfil endpoints", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        network: ["webhook.site"],
        declared_purpose: "Webhook tester",
      };
      const result = validatePermissionManifest(manifest, "webhook-skill");
      expect(result.risk_factors.some((f) => f.includes("webhook.site"))).toBe(true);
    });

    it("should flag sensitive env var patterns", () => {
      const cases = [
        { env: "AWS_SECRET_ACCESS_KEY", pattern: "AWS_" },
        { env: "GITHUB_TOKEN", pattern: "TOKEN" },
        { env: "DB_PASSWORD", pattern: "PASSWORD" },
        { env: "API_KEY", pattern: "KEY" },
      ];

      for (const { env, pattern } of cases) {
        const manifest: SkillPermissionManifest = {
          version: 1,
          env: [env],
          declared_purpose: "Test",
        };
        const result = validatePermissionManifest(manifest, "test-skill");
        expect(
          result.risk_factors.some((f) => f.toLowerCase().includes("sensitive")),
          `Should flag ${env} as sensitive (pattern: ${pattern})`,
        ).toBe(true);
      }
    });

    it("should flag dangerous executables", () => {
      const dangerous = ["bash", "sh", "sudo", "rm", "dd"];

      for (const exec of dangerous) {
        const manifest: SkillPermissionManifest = {
          version: 1,
          exec: [exec],
          declared_purpose: "Test",
        };
        const result = validatePermissionManifest(manifest, "test-skill");
        expect(
          result.risk_factors.some((f) => f.includes(exec)),
          `Should flag ${exec} as dangerous`,
        ).toBe(true);
      }
    });
  });

  describe("Security warnings", () => {
    it("should warn when high-risk skill lacks security_notes", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        env: ["SECRET_KEY"],
        declared_purpose: "Secret accessor",
        // No security_notes
      };
      const result = validatePermissionManifest(manifest, "secret-skill");
      expect(result.warnings.some((w) => w.includes("security_notes"))).toBe(true);
    });

    it("should not warn when high-risk skill has security_notes", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        env: ["SECRET_KEY"],
        declared_purpose: "Secret accessor",
        security_notes: "This accesses secrets for encryption purposes only",
      };
      const result = validatePermissionManifest(manifest, "secret-skill");
      expect(result.warnings.some((w) => w.includes("security_notes"))).toBe(false);
    });

    it("should warn when skill lacks declared_purpose", () => {
      const manifest: SkillPermissionManifest = {
        version: 1,
        // No declared_purpose
      };
      const result = validatePermissionManifest(manifest, "mystery-skill");
      expect(result.warnings.some((w) => w.includes("declared_purpose"))).toBe(true);
    });
  });
});

describe("SkillsSecurityConfig types", () => {
  it("should accept valid requireManifest values", () => {
    const configs: SkillsSecurityConfig[] = [
      { requireManifest: "allow" },
      { requireManifest: "warn" },
      { requireManifest: "prompt" },
      { requireManifest: "deny" },
    ];

    // Type check passes if this compiles
    expect(configs).toHaveLength(4);
  });

  it("should accept valid maxAutoLoadRisk values", () => {
    const configs: SkillsSecurityConfig[] = [
      { maxAutoLoadRisk: "minimal" },
      { maxAutoLoadRisk: "low" },
      { maxAutoLoadRisk: "moderate" },
      { maxAutoLoadRisk: "high" },
      { maxAutoLoadRisk: "critical" },
    ];

    // Type check passes if this compiles
    expect(configs).toHaveLength(5);
  });
});
