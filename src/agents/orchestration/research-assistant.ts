/**
 * Research Assistant Agent for Clawdis orchestration system.
 *
 * This agent specializes in:
 * - Conducting web research and summarizing findings
 * - Extracting and analyzing information from documents
 * - Tracking research topics over time using memory
 * - Synthesizing information from multiple sources
 * - Generating research reports and briefings
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";
import { createMemoryService, isMemoryEnabled } from "../../memory/index.js";
import type { MemoryCategory, MemorySource } from "../../memory/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AnyAgentTool = AgentTool<TSchema, unknown>;

/**
 * Research topic tracking metadata.
 */
export interface ResearchTopic {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  sources: ResearchSource[];
  findings: ResearchFinding[];
  status: "active" | "paused" | "completed";
  createdAt: number;
  updatedAt: number;
}

/**
 * A source used in research.
 */
export interface ResearchSource {
  id: string;
  type: "web" | "document" | "memory" | "api";
  url?: string;
  title: string;
  summary?: string;
  reliability: "high" | "medium" | "low" | "unknown";
  accessedAt: number;
}

/**
 * A finding from research.
 */
export interface ResearchFinding {
  id: string;
  content: string;
  sourceId: string;
  confidence: number;
  tags: string[];
  createdAt: number;
}

/**
 * Research briefing output format.
 */
export interface ResearchBriefing {
  topic: string;
  executiveSummary: string;
  keyFindings: string[];
  sources: Array<{
    title: string;
    url?: string;
    reliability: string;
  }>;
  recommendations?: string[];
  generatedAt: string;
}

/**
 * Synthesis result combining multiple sources.
 */
export interface SynthesisResult {
  query: string;
  synthesizedContent: string;
  sourceCount: number;
  confidence: number;
  gaps: string[];
  contradictions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Research Assistant agent configuration.
 */
export const ResearchAssistantConfig = {
  name: "research-assistant",
  label: "Research Assistant",
  description:
    "Conducts research, analyzes documents, tracks topics, and generates briefings",
  capabilities: [
    "web_research",
    "document_analysis",
    "topic_tracking",
    "synthesis",
    "briefing_generation",
    "memory_integration",
  ],
  defaultSettings: {
    maxSourcesPerTopic: 20,
    maxFindingsPerTopic: 50,
    defaultReliability: "unknown" as const,
    synthesisMinSources: 2,
    briefingMaxFindings: 10,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction - remove common words and extract significant terms
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "what",
    "which",
    "who",
    "whom",
    "how",
    "when",
    "where",
    "why",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Count frequency and return top keywords
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function assessReliability(source: {
  url?: string;
  type: string;
}): ResearchSource["reliability"] {
  if (!source.url) return "unknown";

  const url = source.url.toLowerCase();

  // High reliability domains
  if (
    url.includes(".gov") ||
    url.includes(".edu") ||
    url.includes("nature.com") ||
    url.includes("sciencedirect") ||
    url.includes("pubmed") ||
    url.includes("arxiv.org")
  ) {
    return "high";
  }

  // Medium reliability
  if (
    url.includes("wikipedia") ||
    url.includes("reuters") ||
    url.includes("bbc") ||
    url.includes("nytimes") ||
    url.includes("github.com")
  ) {
    return "medium";
  }

  return "unknown";
}

function calculateConfidence(findings: ResearchFinding[]): number {
  if (findings.length === 0) return 0;

  // Average confidence weighted by number of findings
  const avgConfidence =
    findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;

  // Boost for multiple sources
  const sourceBoost = Math.min(findings.length * 0.05, 0.2);

  return Math.min(avgConfidence + sourceBoost, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definitions
// ─────────────────────────────────────────────────────────────────────────────

const ResearchTopicSchema = Type.Union([
  Type.Object({
    action: Type.Literal("research_topic"),
    topic: Type.String({
      description: "The research topic or question to investigate",
    }),
    depth: Type.Optional(
      Type.Union([
        Type.Literal("quick"),
        Type.Literal("standard"),
        Type.Literal("deep"),
      ]),
    ),
    sources: Type.Optional(
      Type.Array(
        Type.String({ description: "Specific URLs or document IDs to include" }),
      ),
    ),
    keywords: Type.Optional(
      Type.Array(Type.String({ description: "Additional keywords to focus on" })),
    ),
    saveToMemory: Type.Optional(
      Type.Boolean({ description: "Whether to save findings to memory" }),
    ),
    senderId: Type.Optional(
      Type.String({ description: "User ID for memory association" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("analyze_document"),
    content: Type.String({ description: "Document content to analyze" }),
    documentTitle: Type.Optional(Type.String()),
    documentUrl: Type.Optional(Type.String()),
    analysisType: Type.Optional(
      Type.Union([
        Type.Literal("summary"),
        Type.Literal("extract_facts"),
        Type.Literal("identify_themes"),
        Type.Literal("full"),
      ]),
    ),
    focusAreas: Type.Optional(
      Type.Array(Type.String({ description: "Specific aspects to focus on" })),
    ),
  }),
  Type.Object({
    action: Type.Literal("synthesize"),
    query: Type.String({ description: "What to synthesize information about" }),
    sourceContents: Type.Array(
      Type.Object({
        title: Type.String(),
        content: Type.String(),
        url: Type.Optional(Type.String()),
        reliability: Type.Optional(
          Type.Union([
            Type.Literal("high"),
            Type.Literal("medium"),
            Type.Literal("low"),
            Type.Literal("unknown"),
          ]),
        ),
      }),
    ),
    outputFormat: Type.Optional(
      Type.Union([
        Type.Literal("narrative"),
        Type.Literal("bullet_points"),
        Type.Literal("structured"),
      ]),
    ),
  }),
  Type.Object({
    action: Type.Literal("create_briefing"),
    topic: Type.String({ description: "Topic for the briefing" }),
    findings: Type.Array(
      Type.Object({
        content: Type.String(),
        source: Type.Optional(Type.String()),
        confidence: Type.Optional(Type.Number()),
      }),
    ),
    format: Type.Optional(
      Type.Union([
        Type.Literal("executive"),
        Type.Literal("detailed"),
        Type.Literal("technical"),
      ]),
    ),
    includeRecommendations: Type.Optional(Type.Boolean()),
    maxLength: Type.Optional(
      Type.Number({ description: "Maximum briefing length in words" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("track_topic"),
    topicName: Type.String({ description: "Name of the topic to track" }),
    description: Type.Optional(Type.String()),
    keywords: Type.Optional(Type.Array(Type.String())),
    senderId: Type.Optional(Type.String()),
  }),
  Type.Object({
    action: Type.Literal("get_topic"),
    topicId: Type.Optional(Type.String()),
    topicName: Type.Optional(Type.String()),
    senderId: Type.Optional(Type.String()),
  }),
  Type.Object({
    action: Type.Literal("list_topics"),
    status: Type.Optional(
      Type.Union([
        Type.Literal("active"),
        Type.Literal("paused"),
        Type.Literal("completed"),
        Type.Literal("all"),
      ]),
    ),
    senderId: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
  Type.Object({
    action: Type.Literal("add_finding"),
    topicId: Type.String(),
    content: Type.String({ description: "The finding content" }),
    sourceTitle: Type.Optional(Type.String()),
    sourceUrl: Type.Optional(Type.String()),
    confidence: Type.Optional(
      Type.Number({ description: "Confidence level 0-1" }),
    ),
    tags: Type.Optional(Type.Array(Type.String())),
  }),
  Type.Object({
    action: Type.Literal("search_research"),
    query: Type.String({ description: "Search query across research memory" }),
    topicId: Type.Optional(Type.String()),
    senderId: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleResearchTopic(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const topic = params.topic as string;
  const depth = (params.depth as string) ?? "standard";
  const additionalKeywords = (params.keywords as string[]) ?? [];
  const saveToMemory = (params.saveToMemory as boolean) ?? true;
  const senderId = params.senderId as string | undefined;

  // Extract keywords from the topic
  const extractedKeywords = extractKeywords(topic);
  const allKeywords = [...new Set([...extractedKeywords, ...additionalKeywords])];

  // Create research structure
  const research: ResearchTopic = {
    id: generateId(),
    name: topic,
    description: `Research initiated on: ${topic}`,
    keywords: allKeywords,
    sources: [],
    findings: [],
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Save to memory if enabled
  if (saveToMemory && isMemoryEnabled()) {
    const service = await createMemoryService();
    if (service) {
      await service.save({
        content: `Research topic: ${topic}. Keywords: ${allKeywords.join(", ")}. Status: active. ID: ${research.id}`,
        category: "context" as MemoryCategory,
        source: "agent" as MemorySource,
        senderId: senderId ?? "global",
        metadata: {
          type: "research_topic",
          topicId: research.id,
          keywords: allKeywords,
          depth,
          agent: "research-assistant",
        },
      });
    }
  }

  // Determine research scope based on depth
  const depthConfig = {
    quick: { maxSources: 3, maxFindings: 5 },
    standard: { maxSources: 10, maxFindings: 15 },
    deep: { maxSources: 20, maxFindings: 30 },
  };

  const config = depthConfig[depth as keyof typeof depthConfig] ?? depthConfig.standard;

  return jsonResult({
    success: true,
    research: {
      id: research.id,
      topic: research.name,
      keywords: research.keywords,
      status: research.status,
      depth,
      config,
      savedToMemory: saveToMemory,
    },
    instructions: [
      `Research topic "${topic}" has been initialized with ID: ${research.id}`,
      `Keywords to focus on: ${allKeywords.join(", ")}`,
      `Depth level: ${depth} (max ${config.maxSources} sources, ${config.maxFindings} findings)`,
      "Use web search tools to gather information from relevant sources",
      "Use analyze_document action to process each source",
      "Use add_finding action to record important discoveries",
      "Use create_briefing action to generate the final report",
    ],
  });
}

async function handleAnalyzeDocument(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const content = params.content as string;
  const documentTitle = (params.documentTitle as string) ?? "Untitled Document";
  const documentUrl = params.documentUrl as string | undefined;
  const analysisType = (params.analysisType as string) ?? "full";
  const focusAreas = (params.focusAreas as string[]) ?? [];

  // Create source record
  const source: ResearchSource = {
    id: generateId(),
    type: documentUrl ? "web" : "document",
    url: documentUrl,
    title: documentTitle,
    reliability: assessReliability({ url: documentUrl, type: "document" }),
    accessedAt: Date.now(),
  };

  // Extract keywords and create summary
  const keywords = extractKeywords(content);
  const wordCount = content.split(/\s+/).length;
  const sentences = content.match(/[^.!?]+[.!?]+/g) ?? [];

  // Generate analysis based on type
  const analysis: Record<string, unknown> = {
    sourceId: source.id,
    documentTitle,
    documentUrl,
    reliability: source.reliability,
    wordCount,
    sentenceCount: sentences.length,
    keywords,
  };

  if (analysisType === "summary" || analysisType === "full") {
    // Extract first few sentences as summary
    analysis.summary = sentences.slice(0, 3).join(" ").trim();
  }

  if (analysisType === "extract_facts" || analysisType === "full") {
    // Simple fact extraction - sentences with specific patterns
    const factPatterns = /(?:is|are|was|were|has|have|had|will|can|may|should)\s/i;
    const potentialFacts = sentences
      .filter((s) => factPatterns.test(s))
      .slice(0, 10)
      .map((s) => s.trim());
    analysis.facts = potentialFacts;
  }

  if (analysisType === "identify_themes" || analysisType === "full") {
    // Group keywords into potential themes
    analysis.themes = keywords.slice(0, 5).map((kw) => ({
      keyword: kw,
      frequency: (content.toLowerCase().match(new RegExp(kw, "gi")) ?? []).length,
    }));
  }

  if (focusAreas.length > 0) {
    // Find relevant content for each focus area
    analysis.focusAreaAnalysis = focusAreas.map((area) => {
      const areaKeywords = extractKeywords(area);
      const relevantSentences = sentences
        .filter((s) =>
          areaKeywords.some((kw) => s.toLowerCase().includes(kw)),
        )
        .slice(0, 3);
      return {
        area,
        relevantContent: relevantSentences.join(" "),
        found: relevantSentences.length > 0,
      };
    });
  }

  return jsonResult({
    success: true,
    analysis,
    source,
  });
}

async function handleSynthesize(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const query = params.query as string;
  const sourceContents = params.sourceContents as Array<{
    title: string;
    content: string;
    url?: string;
    reliability?: string;
  }>;
  const outputFormat = (params.outputFormat as string) ?? "narrative";

  if (sourceContents.length < 2) {
    return jsonResult({
      success: false,
      error: "synthesis_requires_multiple_sources",
      message: "Synthesis requires at least 2 sources to combine",
      providedSources: sourceContents.length,
    });
  }

  // Extract key information from each source
  const sourceAnalyses = sourceContents.map((source) => ({
    title: source.title,
    url: source.url,
    reliability: source.reliability ?? assessReliability({ url: source.url, type: "web" }),
    keywords: extractKeywords(source.content),
    keyPoints: source.content
      .match(/[^.!?]+[.!?]+/g)
      ?.slice(0, 5)
      .map((s) => s.trim()) ?? [],
  }));

  // Find common keywords (appearing in multiple sources)
  const allKeywords = sourceAnalyses.flatMap((s) => s.keywords);
  const keywordCounts = new Map<string, number>();
  for (const kw of allKeywords) {
    keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
  }
  const commonKeywords = Array.from(keywordCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw);

  // Identify gaps (keywords in query not well covered)
  const queryKeywords = extractKeywords(query);
  const gaps = queryKeywords.filter(
    (qk) => !commonKeywords.includes(qk) && !allKeywords.includes(qk),
  );

  // Look for contradictions (simplified - sources with low overlap on key topics)
  const contradictions: string[] = [];
  for (let i = 0; i < sourceAnalyses.length; i++) {
    for (let j = i + 1; j < sourceAnalyses.length; j++) {
      const overlap = sourceAnalyses[i].keywords.filter((k) =>
        sourceAnalyses[j].keywords.includes(k),
      );
      if (
        overlap.length === 0 &&
        sourceAnalyses[i].keywords.length > 3 &&
        sourceAnalyses[j].keywords.length > 3
      ) {
        contradictions.push(
          `"${sourceAnalyses[i].title}" and "${sourceAnalyses[j].title}" have minimal overlap`,
        );
      }
    }
  }

  // Calculate overall confidence
  const reliabilityScores: Record<string, number> = {
    high: 0.9,
    medium: 0.7,
    low: 0.4,
    unknown: 0.5,
  };
  const avgReliability =
    sourceAnalyses.reduce(
      (sum, s) => sum + (reliabilityScores[s.reliability] ?? 0.5),
      0,
    ) / sourceAnalyses.length;
  const confidence = Math.min(
    avgReliability * (1 + commonKeywords.length * 0.02),
    0.95,
  );

  // Generate synthesized content based on format
  let synthesizedContent: string;
  if (outputFormat === "bullet_points") {
    const points = sourceAnalyses.flatMap((s) =>
      s.keyPoints.slice(0, 2).map((p) => `- ${p} (${s.title})`),
    );
    synthesizedContent = points.join("\n");
  } else if (outputFormat === "structured") {
    synthesizedContent = JSON.stringify(
      {
        query,
        commonThemes: commonKeywords,
        sourceBreakdown: sourceAnalyses.map((s) => ({
          title: s.title,
          reliability: s.reliability,
          keyPoints: s.keyPoints,
        })),
      },
      null,
      2,
    );
  } else {
    // Narrative format
    synthesizedContent = `Based on analysis of ${sourceContents.length} sources regarding "${query}": `;
    synthesizedContent += `The key themes identified are: ${commonKeywords.slice(0, 5).join(", ")}. `;
    synthesizedContent += sourceAnalyses
      .map((s) => `${s.title} highlights: ${s.keyPoints[0] ?? "N/A"}`)
      .join(" ");
  }

  const result: SynthesisResult = {
    query,
    synthesizedContent,
    sourceCount: sourceContents.length,
    confidence,
    gaps,
    contradictions,
  };

  return jsonResult({
    success: true,
    synthesis: result,
    metadata: {
      commonKeywords,
      sourceAnalyses: sourceAnalyses.map((s) => ({
        title: s.title,
        reliability: s.reliability,
        keywordCount: s.keywords.length,
      })),
    },
  });
}

async function handleCreateBriefing(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const topic = params.topic as string;
  const findings = params.findings as Array<{
    content: string;
    source?: string;
    confidence?: number;
  }>;
  const format = (params.format as string) ?? "executive";
  const includeRecommendations = (params.includeRecommendations as boolean) ?? true;
  const maxLength = (params.maxLength as number) ?? 500;

  if (findings.length === 0) {
    return jsonResult({
      success: false,
      error: "no_findings",
      message: "Cannot create briefing without any findings",
    });
  }

  // Sort findings by confidence
  const sortedFindings = [...findings].sort(
    (a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5),
  );

  // Generate executive summary
  const topFindings = sortedFindings.slice(0, 3);
  const executiveSummary = `This briefing covers research on "${topic}". ${topFindings.length} key findings were identified with an average confidence of ${(topFindings.reduce((sum, f) => sum + (f.confidence ?? 0.5), 0) / topFindings.length * 100).toFixed(0)}%.`;

  // Extract unique sources
  const sources = Array.from(
    new Set(findings.map((f) => f.source).filter(Boolean)),
  ).map((s) => ({
    title: s as string,
    reliability: "unknown",
  }));

  // Generate recommendations based on findings
  let recommendations: string[] | undefined;
  if (includeRecommendations) {
    recommendations = [];
    if (findings.some((f) => (f.confidence ?? 0.5) < 0.6)) {
      recommendations.push("Consider additional research to improve confidence in lower-rated findings");
    }
    if (sources.length < 3) {
      recommendations.push("Broaden source diversity for more comprehensive coverage");
    }
    if (findings.length > 10) {
      recommendations.push("Consider focusing on top findings for actionable insights");
    }
    recommendations.push(`Continue monitoring developments related to "${topic}"`);
  }

  // Apply format-specific adjustments
  let keyFindings: string[];
  if (format === "executive") {
    keyFindings = sortedFindings.slice(0, 5).map((f) => f.content);
  } else if (format === "detailed") {
    keyFindings = sortedFindings.slice(0, 10).map(
      (f) => `[${((f.confidence ?? 0.5) * 100).toFixed(0)}%] ${f.content}${f.source ? ` (${f.source})` : ""}`,
    );
  } else {
    // Technical format
    keyFindings = sortedFindings.map(
      (f) => `- ${f.content}\n  Confidence: ${((f.confidence ?? 0.5) * 100).toFixed(0)}%\n  Source: ${f.source ?? "N/A"}`,
    );
  }

  const briefing: ResearchBriefing = {
    topic,
    executiveSummary,
    keyFindings,
    sources,
    recommendations,
    generatedAt: new Date().toISOString(),
  };

  // Apply max length constraint (approximate word count)
  const totalWords = [
    briefing.executiveSummary,
    ...briefing.keyFindings,
    ...(briefing.recommendations ?? []),
  ].join(" ").split(/\s+/).length;

  return jsonResult({
    success: true,
    briefing,
    metadata: {
      format,
      totalFindings: findings.length,
      includedFindings: keyFindings.length,
      approximateWordCount: totalWords,
      truncated: totalWords > maxLength,
    },
  });
}

async function handleTrackTopic(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const topicName = params.topicName as string;
  const description = params.description as string | undefined;
  const keywords = (params.keywords as string[]) ?? extractKeywords(topicName);
  const senderId = params.senderId as string | undefined;

  if (!isMemoryEnabled()) {
    return jsonResult({
      success: false,
      error: "memory_not_enabled",
      message: "Memory system is required for topic tracking",
    });
  }

  const service = await createMemoryService();
  if (!service) {
    return jsonResult({
      success: false,
      error: "memory_initialization_failed",
      message: "Failed to initialize memory service",
    });
  }

  const topicId = generateId();
  const topic: ResearchTopic = {
    id: topicId,
    name: topicName,
    description,
    keywords,
    sources: [],
    findings: [],
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Save topic to memory
  await service.save({
    content: `Research topic tracking: ${topicName}. ${description ?? ""}. Keywords: ${keywords.join(", ")}. Topic ID: ${topicId}`,
    category: "context" as MemoryCategory,
    source: "agent" as MemorySource,
    senderId: senderId ?? "global",
    metadata: {
      type: "research_topic_tracking",
      topicId,
      topicName,
      keywords,
      status: "active",
      agent: "research-assistant",
    },
  });

  return jsonResult({
    success: true,
    topic: {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      keywords: topic.keywords,
      status: topic.status,
      createdAt: new Date(topic.createdAt).toISOString(),
    },
    message: `Now tracking research topic: "${topicName}"`,
  });
}

async function handleGetTopic(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const topicId = params.topicId as string | undefined;
  const topicName = params.topicName as string | undefined;
  const senderId = params.senderId as string | undefined;

  if (!topicId && !topicName) {
    return jsonResult({
      success: false,
      error: "missing_identifier",
      message: "Either topicId or topicName is required",
    });
  }

  if (!isMemoryEnabled()) {
    return jsonResult({
      success: false,
      error: "memory_not_enabled",
      message: "Memory system is required for topic retrieval",
    });
  }

  const service = await createMemoryService();
  if (!service) {
    return jsonResult({
      success: false,
      error: "memory_initialization_failed",
    });
  }

  const searchQuery = topicId ?? `research topic: ${topicName}`;
  const results = await service.search(searchQuery, {
    senderId,
    limit: 5,
  });

  const topicMemories = results.filter(
    (m) =>
      (m.metadata as Record<string, unknown>)?.type === "research_topic_tracking" ||
      (m.metadata as Record<string, unknown>)?.type === "research_topic",
  );

  if (topicMemories.length === 0) {
    return jsonResult({
      success: false,
      error: "topic_not_found",
      message: `No research topic found matching "${topicId ?? topicName}"`,
    });
  }

  return jsonResult({
    success: true,
    topic: {
      memoryId: topicMemories[0].id,
      content: topicMemories[0].content,
      metadata: topicMemories[0].metadata,
      createdAt: new Date(topicMemories[0].createdAt).toISOString(),
    },
    relatedMemories: topicMemories.slice(1).map((m) => ({
      id: m.id,
      content: m.content,
      score: m.score,
    })),
  });
}

async function handleListTopics(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const status = (params.status as string) ?? "all";
  const senderId = params.senderId as string | undefined;
  const limit = (params.limit as number) ?? 10;

  if (!isMemoryEnabled()) {
    return jsonResult({
      success: false,
      error: "memory_not_enabled",
      message: "Memory system is required for listing topics",
    });
  }

  const service = await createMemoryService();
  if (!service) {
    return jsonResult({
      success: false,
      error: "memory_initialization_failed",
    });
  }

  const results = await service.search("research topic tracking", {
    senderId,
    limit: limit * 2, // Fetch extra to filter
  });

  let topics = results.filter(
    (m) =>
      (m.metadata as Record<string, unknown>)?.type === "research_topic_tracking" ||
      (m.metadata as Record<string, unknown>)?.type === "research_topic",
  );

  if (status !== "all") {
    topics = topics.filter(
      (m) => (m.metadata as Record<string, unknown>)?.status === status,
    );
  }

  return jsonResult({
    success: true,
    count: topics.length,
    topics: topics.slice(0, limit).map((m) => ({
      memoryId: m.id,
      topicId: (m.metadata as Record<string, unknown>)?.topicId,
      name: (m.metadata as Record<string, unknown>)?.topicName,
      status: (m.metadata as Record<string, unknown>)?.status ?? "active",
      keywords: (m.metadata as Record<string, unknown>)?.keywords,
      createdAt: new Date(m.createdAt).toISOString(),
    })),
  });
}

async function handleAddFinding(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const topicId = params.topicId as string;
  const content = params.content as string;
  const sourceTitle = params.sourceTitle as string | undefined;
  const sourceUrl = params.sourceUrl as string | undefined;
  const confidence = (params.confidence as number) ?? 0.7;
  const tags = (params.tags as string[]) ?? [];

  if (!isMemoryEnabled()) {
    return jsonResult({
      success: false,
      error: "memory_not_enabled",
      message: "Memory system is required for adding findings",
    });
  }

  const service = await createMemoryService();
  if (!service) {
    return jsonResult({
      success: false,
      error: "memory_initialization_failed",
    });
  }

  const findingId = generateId();
  const finding: ResearchFinding = {
    id: findingId,
    content,
    sourceId: sourceUrl ?? sourceTitle ?? "unknown",
    confidence: Math.max(0, Math.min(1, confidence)),
    tags,
    createdAt: Date.now(),
  };

  await service.save({
    content: `Research finding for topic ${topicId}: ${content}. Source: ${sourceTitle ?? "N/A"}. Confidence: ${(confidence * 100).toFixed(0)}%. Tags: ${tags.join(", ")}`,
    category: "fact" as MemoryCategory,
    source: "agent" as MemorySource,
    senderId: "global",
    metadata: {
      type: "research_finding",
      topicId,
      findingId,
      sourceTitle,
      sourceUrl,
      confidence: finding.confidence,
      tags,
      agent: "research-assistant",
    },
  });

  return jsonResult({
    success: true,
    finding: {
      id: finding.id,
      topicId,
      content: finding.content,
      confidence: finding.confidence,
      source: sourceTitle ?? sourceUrl ?? "unknown",
      tags: finding.tags,
      createdAt: new Date(finding.createdAt).toISOString(),
    },
  });
}

async function handleSearchResearch(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const query = params.query as string;
  const topicId = params.topicId as string | undefined;
  const senderId = params.senderId as string | undefined;
  const limit = (params.limit as number) ?? 10;

  if (!isMemoryEnabled()) {
    return jsonResult({
      success: false,
      error: "memory_not_enabled",
      message: "Memory system is required for searching research",
    });
  }

  const service = await createMemoryService();
  if (!service) {
    return jsonResult({
      success: false,
      error: "memory_initialization_failed",
    });
  }

  const searchQuery = topicId ? `${query} topic:${topicId}` : query;
  const results = await service.search(searchQuery, {
    senderId,
    limit: limit * 2,
  });

  // Filter to research-related memories
  const researchResults = results.filter((m) => {
    const metadata = m.metadata as Record<string, unknown>;
    const type = metadata?.type as string;
    return (
      type === "research_topic" ||
      type === "research_topic_tracking" ||
      type === "research_finding" ||
      m.content.toLowerCase().includes("research")
    );
  });

  // Further filter by topicId if specified
  const filteredResults = topicId
    ? researchResults.filter(
        (m) => (m.metadata as Record<string, unknown>)?.topicId === topicId,
      )
    : researchResults;

  return jsonResult({
    success: true,
    query,
    topicId: topicId ?? null,
    count: filteredResults.length,
    results: filteredResults.slice(0, limit).map((m) => ({
      id: m.id,
      content: m.content,
      score: m.score.toFixed(3),
      type: (m.metadata as Record<string, unknown>)?.type ?? "unknown",
      topicId: (m.metadata as Record<string, unknown>)?.topicId,
      createdAt: new Date(m.createdAt).toISOString(),
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Tool Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the Research Assistant tool for agent use.
 */
export function createResearchAssistantTool(): AnyAgentTool {
  return {
    label: ResearchAssistantConfig.label,
    name: "research_assistant",
    description: `Research assistant for conducting investigations, analyzing documents, and generating briefings. Capabilities:

- research_topic: Initialize research on a topic with automatic keyword extraction
- analyze_document: Analyze document content for facts, themes, and summaries
- synthesize: Combine information from multiple sources into coherent insights
- create_briefing: Generate formatted research briefings with key findings

Topic tracking (requires memory):
- track_topic: Start tracking a research topic over time
- get_topic: Retrieve a tracked topic's details
- list_topics: List all tracked research topics
- add_finding: Add a new finding to a research topic
- search_research: Search across all research memories

Best practices:
- Use research_topic first to set up keyword-focused investigation
- Use analyze_document for each source to extract structured information
- Use synthesize to combine multiple source analyses
- Use create_briefing for final deliverable
- Track topics for ongoing research areas`,
    parameters: ResearchTopicSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        case "research_topic":
          return handleResearchTopic(params);
        case "analyze_document":
          return handleAnalyzeDocument(params);
        case "synthesize":
          return handleSynthesize(params);
        case "create_briefing":
          return handleCreateBriefing(params);
        case "track_topic":
          return handleTrackTopic(params);
        case "get_topic":
          return handleGetTopic(params);
        case "list_topics":
          return handleListTopics(params);
        case "add_finding":
          return handleAddFinding(params);
        case "search_research":
          return handleSearchResearch(params);
        default:
          return jsonResult({
            success: false,
            error: "unknown_action",
            action,
            availableActions: [
              "research_topic",
              "analyze_document",
              "synthesize",
              "create_briefing",
              "track_topic",
              "get_topic",
              "list_topics",
              "add_finding",
              "search_research",
            ],
          });
      }
    },
  };
}

/**
 * Create all research assistant tools as an array.
 */
export function createResearchAssistantTools(): AnyAgentTool[] {
  return [createResearchAssistantTool()];
}

export default createResearchAssistantTool;
