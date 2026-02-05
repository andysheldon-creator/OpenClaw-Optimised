import type { QueryOrchestrator, QueryRequest, QueryResponse, QueryResult } from "../interfaces.js";
import { mockQueryResults } from "./__fixtures__/query-results.js";

type MockQueryOrchestratorOptions = {
  results?: QueryResult[];
  latencyMs?: number;
};

export class MockQueryOrchestrator implements QueryOrchestrator {
  private readonly results: QueryResult[];
  private readonly latencyMs?: number;

  constructor(options: MockQueryOrchestratorOptions = {}) {
    this.results = options.results ?? mockQueryResults;
    this.latencyMs = options.latencyMs;
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    const limit = request.limit ?? this.results.length;
    const sliced = this.results.slice(0, limit);
    return {
      results: sliced,
      latencyMs: this.latencyMs,
    };
  }
}
