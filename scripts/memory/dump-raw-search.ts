import { GraphService } from "../../src/services/memory/GraphService.js";

async function main() {
  const sessionId = process.argv[2] || "global-user-memory";
  const query = process.argv[3] || "knowledge";

  const graph = new GraphService();
  console.log(`\n🔍 RAW SEARCH DUMP for: "${query}"\n`);

  try {
    const nodes = await graph.searchNodes(sessionId, query);
    console.log("--- NODES ---");
    console.log(JSON.stringify(nodes, null, 2));

    const facts = await graph.searchFacts(sessionId, query);
    console.log("\n--- FACTS ---");
    console.log(JSON.stringify(facts, null, 2));

  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  }
}

main();
