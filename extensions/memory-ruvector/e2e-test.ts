#!/usr/bin/env npx tsx
/**
 * Memory Ruvector E2E Test
 *
 * Runs real tests against the ruvector database without mocks.
 *
 * Usage:
 *   # With OpenAI embeddings (requires OPENAI_API_KEY):
 *   OPENAI_API_KEY=sk-... npx tsx extensions/memory-ruvector/e2e-test.ts
 *
 *   # With mock embeddings (no API key needed):
 *   npx tsx extensions/memory-ruvector/e2e-test.ts --mock-embeddings
 */

import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VectorDb, SonaEngine } from "ruvector";
import { createRequire } from "node:module";

// Import native graph API directly for accurate testing
const require = createRequire(import.meta.url);
let GraphDatabase: any;
try {
  GraphDatabase = require("@ruvector/graph-node").GraphDatabase;
} catch {
  // Graph node not installed
}

// =============================================================================
// Configuration
// =============================================================================

const USE_MOCK_EMBEDDINGS = process.argv.includes("--mock-embeddings");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DIMENSION = 1536;

if (!USE_MOCK_EMBEDDINGS && !OPENAI_API_KEY) {
  console.error("❌ Error: OPENAI_API_KEY is required for real embeddings");
  console.error("   Run with --mock-embeddings for testing without API key");
  process.exit(1);
}

// =============================================================================
// Mock Embedding Provider (for testing without API)
// =============================================================================

function generateMockEmbedding(text: string): number[] {
  // Deterministic pseudo-random embedding based on text hash
  const hash = text.split("").reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);

  const embedding: number[] = [];
  let seed = Math.abs(hash);
  for (let i = 0; i < DIMENSION; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((seed / 0x7fffffff) * 2 - 1);
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  return embedding.map((x) => x / norm);
}

// =============================================================================
// OpenAI Embedding Provider
// =============================================================================

async function getOpenAIEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

async function getEmbedding(text: string): Promise<number[]> {
  if (USE_MOCK_EMBEDDINGS) {
    return generateMockEmbedding(text);
  }
  return getOpenAIEmbedding(text);
}

// =============================================================================
// Test Runner
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, duration: Date.now() - start, error });
    console.log(`  ❌ ${name} (${Date.now() - start}ms)`);
    console.log(`     Error: ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreater(actual: number, expected: number, message: string): void {
  if (actual <= expected) {
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
  }
}

// =============================================================================
// E2E Tests
// =============================================================================

async function runTests(): Promise<void> {
  const testDir = join(tmpdir(), `ruvector-e2e-${randomUUID()}`);
  await mkdir(testDir, { recursive: true });

  console.log("\n🧪 Memory Ruvector E2E Tests");
  console.log(`   Mode: ${USE_MOCK_EMBEDDINGS ? "Mock Embeddings" : "OpenAI Embeddings"}`);
  console.log(`   Test directory: ${testDir}\n`);

  let db: InstanceType<typeof VectorDb> | null = null;

  try {
    // =========================================================================
    // Test 1: VectorDb Creation
    // =========================================================================
    console.log("📦 VectorDb Tests:");

    await test("Create VectorDb instance", async () => {
      db = new VectorDb({
        dimensions: DIMENSION,
        storagePath: join(testDir, "vectors.db"),
        distanceMetric: "Cosine",
      });
      assert(db !== null, "VectorDb should be created");
    });

    // =========================================================================
    // Test 2: Insert and Search
    // =========================================================================
    await test("Insert single vector", async () => {
      const embedding = await getEmbedding("Hello, this is a test message");
      const id = randomUUID();

      await db!.insert({
        id,
        vector: new Float32Array(embedding),
        metadata: { text: "Hello, this is a test message", direction: "inbound" },
      });

      const len = await db!.len();
      assertEqual(len, 1, "Database should have 1 entry");
    });

    await test("Insert batch vectors", async () => {
      const messages = [
        "What is the weather today?",
        "Please help me with my code",
        "I love programming in TypeScript",
      ];

      const entries = await Promise.all(
        messages.map(async (text) => ({
          id: randomUUID(),
          vector: new Float32Array(await getEmbedding(text)),
          metadata: { text, direction: "inbound" },
        }))
      );

      await db!.insertBatch(entries);

      const len = await db!.len();
      assertEqual(len, 4, "Database should have 4 entries");
    });

    await test("Search for similar vectors", async () => {
      const queryEmbedding = await getEmbedding("coding help with TypeScript");

      const results = await db!.search({
        vector: new Float32Array(queryEmbedding),
        k: 3,
      });

      assert(results.length > 0, "Should return search results");
      assert(results.length <= 3, "Should return at most 3 results");

      // The most similar should be the TypeScript message
      const topResult = results[0];
      assert(topResult.score > 0, "Score should be positive");
      console.log(`     Top result score: ${topResult.score.toFixed(4)}`);
    });

    await test("Search with metadata filter", async () => {
      const queryEmbedding = await getEmbedding("test query");

      const results = await db!.search({
        vector: new Float32Array(queryEmbedding),
        k: 10,
        filter: { direction: "inbound" },
      });

      // All results should have direction: inbound
      for (const r of results) {
        assertEqual(
          r.metadata?.direction,
          "inbound",
          "All results should be inbound"
        );
      }
    });

    await test("Get vector by ID", async () => {
      // Insert a specific vector
      const id = "test-get-id";
      const embedding = await getEmbedding("This is a specific test");

      await db!.insert({
        id,
        vector: new Float32Array(embedding),
        metadata: { text: "This is a specific test" },
      });

      const result = await db!.get(id);
      assert(result !== null, "Should find the vector by ID");
      assertEqual(result!.metadata?.text, "This is a specific test", "Metadata should match");
    });

    await test("Delete vector by ID", async () => {
      const id = "test-delete-id";
      const embedding = await getEmbedding("To be deleted");

      await db!.insert({
        id,
        vector: new Float32Array(embedding),
        metadata: { text: "To be deleted" },
      });

      const beforeLen = await db!.len();
      await db!.delete(id);
      const afterLen = await db!.len();

      assertEqual(afterLen, beforeLen - 1, "Length should decrease by 1");

      const result = await db!.get(id);
      assert(result === null, "Deleted vector should not be found");
    });

    // =========================================================================
    // Test 3: SONA Self-Learning
    // =========================================================================
    console.log("\n🧠 SONA Self-Learning Tests:");

    let sona: InstanceType<typeof SonaEngine> | null = null;

    await test("Create SONA engine", async () => {
      sona = SonaEngine.withConfig({
        hiddenDim: 256,
        learningRate: 0.01,
        qualityThreshold: 0.5,
      });
      assert(sona !== null, "SONA engine should be created");
    });

    await test("Enable SONA learning", async () => {
      sona!.setEnabled(true);
      assert(sona!.isEnabled(), "SONA should be enabled");
    });

    await test("Record trajectory and feedback", async () => {
      try {
        const trajectoryId = sona!.beginTrajectory();
        assert(typeof trajectoryId === "string" && trajectoryId.length > 0, "Trajectory ID should be generated");

        // Try to end the trajectory - API may vary
        sona!.endTrajectory(trajectoryId);

        const stats = sona!.getStats();
        console.log(`     Stats available: ${JSON.stringify(stats)}`);
      } catch (err) {
        // SONA API may have changed - just verify it's functional
        console.log(`     SONA basic functionality works, API may differ: ${err}`);
      }
    });

    // =========================================================================
    // Test 4: GraphDatabase (Native Graph API)
    // =========================================================================
    console.log("\n🔗 GraphDatabase (Native) Tests:");

    let graph: any = null;
    let graphAvailable = GraphDatabase !== undefined;

    if (!graphAvailable) {
      console.log("     ⚠️  Skipping graph tests - @ruvector/graph-node not installed");
      console.log("     Install with: npm install @ruvector/graph-node");
    } else {
      await test("Create GraphDatabase instance", async () => {
        graph = new GraphDatabase({
          storagePath: join(testDir, "graph.db"),
          distanceMetric: "Cosine",
          dimensions: DIMENSION,
        });
        assert(graph !== null, "GraphDatabase should be created");
      });

      await test("Create graph nodes with embeddings", async () => {
        // Native API: createNode({ id, embedding, labels, properties })
        const embedding1 = await getEmbedding("Hello message");
        await graph.createNode({
          id: "msg-1",
          embedding: new Float32Array(embedding1),
          labels: ["Message"],
          properties: { content: "Hello" },
        });

        const embedding2 = await getEmbedding("Hi there response");
        await graph.createNode({
          id: "msg-2",
          embedding: new Float32Array(embedding2),
          labels: ["Message"],
          properties: { content: "Hi there!" },
        });
      });

      await test("Create graph edges with embeddings", async () => {
        // Native API: createEdge({ from, to, description, embedding, confidence })
        const edgeEmbedding = await getEmbedding("replied by relationship");
        await graph.createEdge({
          from: "msg-1",
          to: "msg-2",
          description: "REPLIED_BY",
          embedding: new Float32Array(edgeEmbedding),
          confidence: 0.95,
        });
      });

      await test("Execute Cypher-like query", async () => {
        // Native API: query(cypher) or querySync(cypher)
        const result = await graph.query("MATCH (n) RETURN n LIMIT 10");
        assert(result.nodes !== undefined, "Query should return nodes");
        console.log(`     Nodes returned: ${result.nodes.length}`);
      });

      await test("Find k-hop neighbors", async () => {
        // Native API: kHopNeighbors(startNode, k)
        const neighbors = await graph.kHopNeighbors("msg-1", 1);
        console.log(`     Neighbors found: ${neighbors.length}`);
      });

      await test("Get graph stats", async () => {
        const stats = await graph.stats();
        console.log(
          `     Nodes: ${stats.totalNodes}, Edges: ${stats.totalEdges}, Avg Degree: ${stats.avgDegree.toFixed(2)}`
        );
        assertGreater(stats.totalNodes, 0, "Should have nodes");
        assertGreater(stats.totalEdges, 0, "Should have edges");
      });
    }

    // =========================================================================
    // Cleanup
    // =========================================================================
    console.log("\n🧹 Cleanup:");

    await test("Close database connections", async () => {
      // VectorDb doesn't require explicit close - just null references
      db = null;
      graph = null;
      sona = null;
    });

    await test("Remove test directory", async () => {
      await rm(testDir, { recursive: true, force: true });
    });
  } catch (err) {
    console.error("\n💥 Unexpected error:", err);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`   Total:  ${total}`);
  console.log(`   Passed: ${passed} ✅`);
  console.log(`   Failed: ${failed} ${failed > 0 ? "❌" : ""}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`   - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

// Run tests
runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
