import type { EditorState, ValidationResult } from "../../../src/clawdbot/ui/workflow-editor.ts";
import { createEmptyEditorState } from "../../../src/clawdbot/ui/workflow-editor.ts";

export const MOCK_EDITOR_YAML = `id: support-sla-escalation
name: Support SLA Escalation
trigger:
  type: cron
  schedule: "*/15 * * * *"
steps:
  - id: load_tickets
    use: suggest-kb-article
    input:
      source: "clawdbot.helpdesk"
  - id: evaluate_sla
    use: escalate-sla-breach
    when: "{{ steps.load_tickets.output.count > 0 }}"
  - id: queue_approval
    use: request-approval
    input:
      reason: "Potential customer-facing escalation"
`;

export function buildMockValidationResult(_content = MOCK_EDITOR_YAML): ValidationResult {
  const diagnostics = [
    {
      severity: "warning" as const,
      message: "Cron cadence is aggressive for business-hours support queues.",
      line: 5,
      column: 3,
      ruleId: "cron-cadence-warning",
    },
    {
      severity: "info" as const,
      message: "Consider adding retry policy for request-approval step.",
      line: 14,
      column: 5,
      ruleId: "missing-retry-policy",
    },
    {
      severity: "error" as const,
      message: "Step 'queue_approval' references undeclared input field 'reason'.",
      line: 16,
      column: 7,
      ruleId: "schema-input-mismatch",
    },
  ];

  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;

  return {
    valid: errorCount === 0,
    diagnostics,
    errorCount,
    warningCount,
  };
}

export function buildMockEditorState(): EditorState {
  const state = createEmptyEditorState();
  const validation = buildMockValidationResult(MOCK_EDITOR_YAML);

  return {
    ...state,
    content: MOCK_EDITOR_YAML,
    savedContent: MOCK_EDITOR_YAML,
    dirty: false,
    cursorLine: 9,
    cursorColumn: 12,
    validation,
  };
}
