export type AutoMemoryConfig = {
  enabled?: boolean;
  messageThreshold?: number;
  minImportance?: number;
  notificationEnabled?: boolean;
  notificationMessage?: string;
};

export type ExtractedFact = {
  fact: string;
  category: string;
  importance: number;
};

export type AnalysisResult = {
  facts: ExtractedFact[];
  summary?: string;
};
