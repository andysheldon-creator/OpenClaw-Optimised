import type { QueryOrchestrator, QueryRequest, QueryResult } from "../interfaces.js";

export type ContextPack = {
  pack: string;
  sources: QueryResult[];
};

type ContextPackBuilderOptions = {
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 2000;

const formatResult = (result: QueryResult, index: number): string => {
  const title = result.title ?? result.kind;
  const score = result.score !== undefined ? ` (score ${result.score.toFixed(2)})` : "";
  const body = result.text ?? "";
  return `#${index + 1} ${title}${score}\n${body}`.trim();
};

const joinWithBudget = (parts: string[], maxChars: number): string => {
  if (parts.length === 0) {
    return "";
  }

  let remaining = maxChars;
  const packed: string[] = [];

  for (const part of parts) {
    if (remaining <= 0) {
      break;
    }

    const trimmed = part.slice(0, remaining);
    packed.push(trimmed);
    remaining -= trimmed.length;
    if (remaining > 0) {
      packed.push("\n\n");
      remaining -= 2;
    }
  }

  return packed.join("").trimEnd();
};

export class ContextPackBuilder {
  private readonly maxChars: number;

  constructor(
    private readonly orchestrator: QueryOrchestrator,
    options: ContextPackBuilderOptions = {},
  ) {
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  }

  async build(request: QueryRequest & { maxChars?: number }): Promise<ContextPack> {
    const response = await this.orchestrator.query(request);
    const results = response.results;
    const limit = request.limit ?? results.length;
    const selected = results.slice(0, limit);
    const formatted = selected.map((result, index) => formatResult(result, index));
    const maxChars = request.maxChars ?? this.maxChars;
    return {
      pack: joinWithBudget(formatted, maxChars),
      sources: selected,
    };
  }
}
