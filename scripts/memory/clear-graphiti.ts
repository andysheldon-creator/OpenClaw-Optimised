#!/usr/bin/env node --import tsx

/**
 * Script to clear the Graphiti knowledge graph database.
 * Run this to start fresh after refactoring the memory architecture.
 */

import { GraphService } from "../../src/services/memory/GraphService.js";

const SESSION_ID = "global-user-memory"; // Stable global ID
const GRAPHITI_URL = process.env.GRAPHITI_MCP_URL || "http://localhost:8001";

async function main() {
  console.log("🧹 [CLEANUP] Clearing Graphiti knowledge graph...");
  console.log(`   Session ID: ${SESSION_ID}`);
  console.log(`   Graphiti URL: ${GRAPHITI_URL}\n`);

  const graph = new GraphService(GRAPHITI_URL);

  try {
    await graph.clearGraph(SESSION_ID);
    console.log("✅ [CLEANUP] Graph cleared successfully!");
    console.log("   You can now restart your agent with a clean memory slate.");
  } catch (error: any) {
    console.error("❌ [CLEANUP] Failed to clear graph:", error.message);
    process.exit(1);
  }
}

main();
