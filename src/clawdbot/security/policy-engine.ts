/**
 * SEC-001 (#75) — Policy engine v1
 *
 * Declarative policy evaluation engine for Clawdbot. Policies are composed
 * of ordered rules that match against action context and produce allow/deny
 * decisions. The engine evaluates rules top-to-bottom; the first matching
 * rule wins. If no rule matches, the engine falls back to a configurable
 * default action.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The outcome a policy rule can produce. */
export type PolicyAction = "allow" | "deny" | "require_approval";

/** A single condition within a rule — matched against action context fields. */
export type PolicyCondition = {
  /** Context field to evaluate (e.g. `"actor"`, `"tool"`, `"environment"`). */
  field: string;
  /** Comparison operator. */
  operator: "eq" | "neq" | "in" | "not_in" | "matches";
  /** Value or values to compare against. */
  value: string | string[];
};

/** A named rule within a policy. Rules are evaluated in declaration order. */
export type PolicyRule = {
  /** Human-readable identifier for this rule. */
  id: string;
  /** Brief description of what this rule controls. */
  description: string;
  /** All conditions must be true for the rule to match (logical AND). */
  conditions: PolicyCondition[];
  /** Action to take when the rule matches. */
  action: PolicyAction;
  /** Optional priority hint — lower numbers evaluate first when sorting. */
  priority: number;
};

/** A named collection of ordered rules with a default fallback action. */
export type Policy = {
  /** Unique policy identifier (e.g. `"prod-outbound"`). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semantic version of this policy definition. */
  version: string;
  /** Ordered list of rules to evaluate. */
  rules: PolicyRule[];
  /** Action to take when no rule matches. */
  defaultAction: PolicyAction;
};

/** The result of evaluating a policy against an action context. */
export type PolicyEvaluation = {
  /** Final action the engine recommends. */
  action: PolicyAction;
  /** The rule that matched, or `null` if the default action was used. */
  matchedRule: PolicyRule | null;
  /** ISO-8601 timestamp of when the evaluation occurred. */
  evaluatedAt: string;
  /** The policy that was evaluated. */
  policyId: string;
};

/** Key-value context describing the action being evaluated. */
export type ActionContext = Record<string, string | string[]>;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Stateless policy evaluation engine.
 *
 * Usage:
 * ```ts
 * const engine = new PolicyEngine([myPolicy]);
 * const result = engine.evaluate("prod-outbound", { actor: "bot", tool: "email-runner" });
 * ```
 */
export class PolicyEngine {
  private readonly policies: Map<string, Policy>;

  constructor(policies: Policy[] = []) {
    this.policies = new Map(policies.map((p) => [p.id, p]));
  }

  /** Register or replace a policy. */
  addPolicy(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }

  /** Remove a policy by id. */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
  }

  /**
   * Evaluate a policy against an action context.
   *
   * @param policyId - The policy to evaluate.
   * @param context  - Key-value pairs describing the action.
   * @returns The evaluation result including the matched rule (if any).
   * @throws If the requested policy is not registered.
   */
  evaluate(policyId: string, context: ActionContext): PolicyEvaluation {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy "${policyId}" is not registered.`);
    }

    // Rules sorted by priority (lower = first), stable within same priority.
    const sorted = [...policy.rules].toSorted((a, b) => a.priority - b.priority);

    for (const rule of sorted) {
      if (matchesAllConditions(rule.conditions, context)) {
        return {
          action: rule.action,
          matchedRule: rule,
          evaluatedAt: new Date().toISOString(),
          policyId: policy.id,
        };
      }
    }

    // No rule matched — use the policy's default action.
    return {
      action: policy.defaultAction,
      matchedRule: null,
      evaluatedAt: new Date().toISOString(),
      policyId: policy.id,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return `true` when every condition in the list matches the context. */
function matchesAllConditions(conditions: PolicyCondition[], context: ActionContext): boolean {
  return conditions.every((c) => matchesCondition(c, context));
}

/** Evaluate a single condition against the context. */
function matchesCondition(condition: PolicyCondition, context: ActionContext): boolean {
  const fieldValue = context[condition.field];

  // Normalise to a comparable string (arrays are not supported for "eq"/"neq").
  const fieldStr = Array.isArray(fieldValue) ? fieldValue.join(",") : (fieldValue ?? "");

  switch (condition.operator) {
    case "eq":
      return fieldStr === condition.value;

    case "neq":
      return fieldStr !== condition.value;

    case "in": {
      const allowed = Array.isArray(condition.value) ? condition.value : [condition.value];
      return allowed.includes(fieldStr);
    }

    case "not_in": {
      const blocked = Array.isArray(condition.value) ? condition.value : [condition.value];
      return !blocked.includes(fieldStr);
    }

    case "matches": {
      const pattern = Array.isArray(condition.value) ? (condition.value[0] ?? "") : condition.value;
      // TODO: cache compiled regex for performance
      return new RegExp(pattern).test(fieldStr);
    }

    default:
      return false;
  }
}
