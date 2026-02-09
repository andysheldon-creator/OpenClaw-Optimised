/**
 * DEMO ONLY — dynamic-code-execution rule trigger.
 *
 * Skill Guard should detect `eval()` and `new Function()` and block this skill.
 *
 * Rule: dynamic-code-execution (critical)
 * Pattern: eval() or new Function()
 */

export function dynamicEval(code: string): unknown {
  // Direct eval — always dangerous
  return eval(code);
}

export function createDynamicFunction(body: string): Function {
  // new Function — equally dangerous
  return new Function("input", body);
}
