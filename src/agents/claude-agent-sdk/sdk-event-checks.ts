/**
 * Event classification helpers for the Claude Agent SDK.
 *
 * Used to detect terminal tool events in the SDK event stream.
 */

export function isSdkTerminalToolEventType(type: unknown): boolean {
  return type === "tool_execution_end" || type === "tool_result";
}
