import type { QueryRequest, QueryResult } from "../../interfaces.js";

export const mockQueryRequest: QueryRequest = {
  query: "Summarize the onboarding details we discussed last week.",
  sessionKey: "session-123",
  limit: 2,
};

export const mockQueryResults: QueryResult[] = [
  {
    id: "memory-1",
    kind: "message",
    title: "Onboarding checklist",
    text: "We covered the account setup steps and assigned owners for each task.",
    score: 0.91,
    source: "hybrid",
    provenance: {
      source: "memory",
      sessionKey: "session-123",
    },
  },
  {
    id: "memory-2",
    kind: "summary",
    title: "Security follow-ups",
    text: "We agreed to rotate credentials and audit access within two weeks.",
    score: 0.87,
    source: "vector",
    provenance: {
      source: "memory",
      sessionKey: "session-123",
    },
  },
  {
    id: "memory-3",
    kind: "fact",
    title: "Next milestone",
    text: "The next milestone review is scheduled for Tuesday afternoon.",
    score: 0.82,
    source: "graph",
    provenance: {
      source: "memory",
      sessionKey: "session-456",
    },
  },
];
