/**
 * Ollama Router Service
 *
 * Routes simple queries to a local Ollama instance (FREE) instead of
 * sending them to the Anthropic API. This handles greetings, basic math,
 * simple factual questions, and other lightweight queries that don't need
 * Claude's full capabilities.
 *
 * Expected to handle 30-40% of all queries for free.
 *
 * Configuration:
 * - OLLAMA_HOST: Ollama server URL (default: http://localhost:11434)
 * - ENABLE_OLLAMA: Enable/disable Ollama routing (default: true)
 * - OLLAMA_MODEL: Model to use (default: llama3.1:8b)
 */

import { defaultRuntime } from "../runtime.js";

/** Ollama configuration from environment. */
const OLLAMA_HOST = (
  process.env.OLLAMA_HOST ?? "http://localhost:11434"
).replace(/\/$/, "");
const ENABLE_OLLAMA = process.env.ENABLE_OLLAMA !== "false";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
const OLLAMA_TIMEOUT_MS = 30_000;

/** Categories of simple queries that can be handled locally. */
type QueryCategory =
  | "greeting"
  | "farewell"
  | "gratitude"
  | "basic_math"
  | "simple_fact"
  | "time_date"
  | "affirmation"
  | "complex";

/** Result of routing decision. */
export type RoutingResult = {
  /** Whether to use Ollama (true) or Claude (false). */
  useOllama: boolean;
  /** The detected query category. */
  category: QueryCategory;
  /** Ollama response if routed locally. */
  response?: string;
  /** Time taken in ms. */
  durationMs?: number;
};

/** Greeting patterns (case-insensitive). */
const GREETING_PATTERNS = [
  /^(hi|hello|hey|howdy|sup|yo|hola|greetings|good\s*(morning|afternoon|evening|night))[\s!.?]*$/i,
  /^what'?s?\s*up[\s!?.]*$/i,
  /^how\s*(are\s*you|do\s*you\s*do|is\s*it\s*going)[\s!?.]*$/i,
  /^(morning|evening|night)[\s!.]*$/i,
];

/** Farewell patterns. */
const FAREWELL_PATTERNS = [
  /^(bye|goodbye|cya|see\s*ya|later|goodnight|gnight|peace|cheers)[\s!.]*$/i,
  /^(talk\s*later|ttyl|gotta\s*go|have\s*a\s*good\s*(one|day|night))[\s!?.]*$/i,
];

/** Gratitude patterns. */
const GRATITUDE_PATTERNS = [
  /^(thanks?|thank\s*you|thx|ty|cheers|ta|appreciated|much\s*appreciated)[\s!.]*$/i,
  /^(thanks?\s*(a\s*lot|so\s*much|very\s*much))[\s!.]*$/i,
];

/** Affirmation patterns. */
const AFFIRMATION_PATTERNS = [
  /^(ok|okay|sure|yes|yep|yeah|yup|got\s*it|understood|roger|cool|nice|great|awesome|perfect|alright)[\s!.]*$/i,
  /^(no\s*problem|np|nw|no\s*worries)[\s!.]*$/i,
];

/** Simple math patterns (basic arithmetic). */
const BASIC_MATH_PATTERNS = [
  /^what('?s|\s+is)\s+\d+\s*[+\-*/x×]\s*\d+[\s?]*$/i,
  /^\d+\s*[+\-*/x×]\s*\d+\s*[=?]?\s*$/i,
  /^(calculate|compute|solve)\s+\d+\s*[+\-*/x×]\s*\d+[\s?]*$/i,
];

/** Time/date queries. */
const TIME_DATE_PATTERNS = [
  /^what('?s|\s+is)\s+the\s+(time|date|day)[\s?]*$/i,
  /^what\s+(time|date|day)\s+is\s+it[\s?]*$/i,
];

/**
 * Classify an incoming message into a query category.
 */
export function classifyQuery(text: string): QueryCategory {
  const trimmed = text.trim();

  // Skip empty or very long messages (likely complex)
  if (!trimmed || trimmed.length > 200) return "complex";

  // Check each pattern category
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) return "greeting";
  }
  for (const pattern of FAREWELL_PATTERNS) {
    if (pattern.test(trimmed)) return "farewell";
  }
  for (const pattern of GRATITUDE_PATTERNS) {
    if (pattern.test(trimmed)) return "gratitude";
  }
  for (const pattern of AFFIRMATION_PATTERNS) {
    if (pattern.test(trimmed)) return "affirmation";
  }
  for (const pattern of BASIC_MATH_PATTERNS) {
    if (pattern.test(trimmed)) return "basic_math";
  }
  for (const pattern of TIME_DATE_PATTERNS) {
    if (pattern.test(trimmed)) return "time_date";
  }

  return "complex";
}

/**
 * Check if Ollama server is reachable.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  if (!ENABLE_OLLAMA) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Send a prompt to Ollama and get a response.
 */
async function queryOllama(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        system:
          systemPrompt ??
          "You are a friendly, concise assistant. Keep responses brief and natural.",
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 150,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = (await response.json()) as { response?: string };
    return data.response?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Handle a simple math expression locally (without even needing Ollama).
 */
function solveBasicMath(text: string): string | null {
  // Extract the math expression
  const match = text.match(/(\d+)\s*([+\-*/x×])\s*(\d+)/);
  if (!match) return null;

  const a = Number.parseInt(match[1], 10);
  const op = match[2];
  const b = Number.parseInt(match[3], 10);

  let result: number;
  switch (op) {
    case "+":
      result = a + b;
      break;
    case "-":
      result = a - b;
      break;
    case "*":
    case "x":
    case "×":
      result = a * b;
      break;
    case "/":
      if (b === 0) return "Cannot divide by zero!";
      result = a / b;
      break;
    default:
      return null;
  }

  // Format nicely
  const displayOp = op === "x" || op === "×" ? "×" : op;
  return Number.isInteger(result)
    ? `${a} ${displayOp} ${b} = ${result}`
    : `${a} ${displayOp} ${b} = ${result.toFixed(2)}`;
}

/**
 * Handle a time/date query locally.
 */
function handleTimeDate(text: string): string {
  const now = new Date();
  const lower = text.toLowerCase();

  if (lower.includes("time")) {
    return `It's ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`;
  }
  if (lower.includes("day")) {
    return `Today is ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`;
  }
  return `Today is ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} and it's ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`;
}

/**
 * Route a message: determine whether to use Ollama or Claude,
 * and return the response if handled locally.
 *
 * @param text - The incoming message text
 * @returns Routing decision and optional local response
 */
export async function routeMessage(text: string): Promise<RoutingResult> {
  const started = Date.now();
  const category = classifyQuery(text);

  // If Ollama is disabled or query is complex, route to Claude
  if (!ENABLE_OLLAMA || category === "complex") {
    return { useOllama: false, category };
  }

  // Handle some categories without even calling Ollama
  switch (category) {
    case "basic_math": {
      const mathResult = solveBasicMath(text);
      if (mathResult) {
        defaultRuntime.log?.(
          `[ollama-router] handled locally: category=${category} duration=${Date.now() - started}ms`,
        );
        return {
          useOllama: true,
          category,
          response: mathResult,
          durationMs: Date.now() - started,
        };
      }
      break;
    }
    case "time_date": {
      const timeResult = handleTimeDate(text);
      defaultRuntime.log?.(
        `[ollama-router] handled locally: category=${category} duration=${Date.now() - started}ms`,
      );
      return {
        useOllama: true,
        category,
        response: timeResult,
        durationMs: Date.now() - started,
      };
    }
  }

  // For greetings, farewells, etc. - try Ollama, fall back to Claude
  const ollamaUp = await isOllamaAvailable();
  if (!ollamaUp) {
    defaultRuntime.log?.(
      `[ollama-router] Ollama unavailable, routing to Claude: category=${category}`,
    );
    return { useOllama: false, category };
  }

  try {
    const response = await queryOllama(text);
    if (response) {
      defaultRuntime.log?.(
        `[ollama-router] handled by Ollama: category=${category} duration=${Date.now() - started}ms`,
      );
      return {
        useOllama: true,
        category,
        response,
        durationMs: Date.now() - started,
      };
    }
  } catch (err) {
    defaultRuntime.log?.(
      `[ollama-router] Ollama query failed, falling back to Claude: ${String(err)}`,
    );
  }

  return { useOllama: false, category, durationMs: Date.now() - started };
}
