export class CopilotInitiatorTracker {
  #firstCallMade = new Set<string>();

  getInitiator(sessionId: string): "user" | "agent" {
    if (this.#firstCallMade.has(sessionId)) {
      return "agent";
    }
    this.#firstCallMade.add(sessionId);
    return "user";
  }

  reset(sessionId: string): void {
    this.#firstCallMade.delete(sessionId);
  }
}

export const copilotInitiatorTracker = new CopilotInitiatorTracker();
