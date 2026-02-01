import { GraphService } from "../../src/services/memory/GraphService.js";

async function main() {
  const sessionId = process.argv[2];
  const query = process.argv[3];

  if (!sessionId) {
    console.log("\n📖 Usage: node --import tsx scripts/memory/ask-memory.ts <sessionId> [query]\n");
    console.log("Example 1 (Stats): node --import tsx scripts/memory/ask-memory.ts global-user-memory");
    console.log("Example 2 (Query): node --import tsx scripts/memory/ask-memory.ts global-user-memory \"Who is Julio?\"\n");
    process.exit(1);
  }

  const graph = new GraphService();

  // If NO query is provided, just show Stats
  if (!query) {
    console.log(`\n📊 Fetching stats for Session: ${sessionId}...\n`);
    try {
      // Get all episodes (high limit to count total)
      const LIMIT = 5000;
      const episodes = await graph.getEpisodesSince(sessionId, new Date(0), LIMIT);

      console.log(`✅ Total Records (Episodes): ${episodes.length}`);
      if (episodes.length === LIMIT) {
        console.log(`   (Note: Hit fetch limit of ${LIMIT}, actual count may be higher)`);
      }

      if (episodes.length > 0) {
        const last = episodes[episodes.length - 1];
        console.log(`\n📅 Latest Record: ${last.created_at || "Unknown"}`);
        const content = last.body || last.content || last.episode_body || "";
        console.log(`   "${content.substring(0, 100).replace(/\n/g, " ")}..."`);
      }

    } catch (e: any) {
      console.error(`❌ Failed to fetch stats: ${e.message}`);
    }
    return;
  }

  console.log(`\n🧠 Querying Mind for: "${query}" (Session: ${sessionId})\n`);

  try {
    // 1. Search Nodes
    console.log("🔍 [NODES] Searching for entities and concepts...");
    const nodes = await graph.searchNodes(sessionId, query);
    if (nodes.length > 0) {
      nodes.forEach((n, i) => {
        console.log(`   [${i + 1}] ${n.content} (Source: ${n._sourceQuery})`);
        if (n.attributes && Object.keys(n.attributes).length > 0) {
          console.log(`       Attributes: ${JSON.stringify(n.attributes)}`);
        }
      });
    } else {
      console.log("   ❌ No relevant nodes found.");
    }

    // 2. Search Facts
    console.log("\n🔍 [FACTS] Searching for relationships and evidence...");
    const facts = await graph.searchFacts(sessionId, query);
    if (facts.length > 0) {
      facts.forEach((f, i) => {
        const content = typeof f === 'string' ? f : (f.content || JSON.stringify(f));
        console.log(`   [${i + 1}] ${content}`);
      });
    } else {
      console.log("   ❌ No relevant facts found.");
    }

    console.log("\n✅ Query complete.\n");

  } catch (e: any) {
    console.error(`\n❌ Query failed: ${e.message}`);
  }
}

main();
