import { GraphService } from "../../src/services/memory/GraphService.js";
import crypto from "node:crypto";

async function main() {
  const sessionId = "test-session-" + crypto.randomBytes(4).toString("hex");
  const graph = new GraphService();

  console.log(`\n🧪 Starting Graphiti Storage Test`);
  console.log(`   Session ID: ${sessionId}\n`);

  try {
    // 1. Add an episode
    const testMessage = "This is a test message for Graphiti storage verification at " + new Date().toISOString();
    console.log(`📝 Adding test episode: "${testMessage}"`);

    // We'll peek into the raw response by modifying the test to call fetch directly or just logging more in GraphService if we could
    // For now, let's just use the current graph object but we might need to modify GraphService.ts briefly to log raws
    await graph.addEpisode(sessionId, testMessage);

    // 2. Wait a bit for indexing
    console.log(`⏳ Waiting 30 seconds for Graphiti background indexing...`);
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 3. Retrieve episodes
    console.log(`🔍 Retrieving episodes for session ${sessionId}...`);
    let episodes = await graph.getEpisodesSince(sessionId, new Date(0));

    if (episodes.length === 0) {
      console.log(`⚠️ No episodes found for ${sessionId}. Checking ALL episodes...`);
      // Force unfiltered call by bypassingsessionId if we could, but let's just use the graph object 
      // We'll need to modify graph.getEpisodesSince temporarily or use a raw fetch
      const mcpId = await (graph as any).ensureSession();
      const res = await fetch(`${(graph as any).mcpBaseURL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": mcpId },
        body: JSON.stringify({
          jsonrpc: "2.0", id: "debug-list", method: "tools/call",
          params: { name: "get_episodes", arguments: { max_episodes: 100 } }
        })
      });
      const data = (graph as any).parseSSEResult(await res.text());
      const raw = data?.result?.content?.[0]?.text;
      if (raw) {
        const allEps = JSON.parse(raw).episodes || [];
        console.log(`📊 Global Episode Count: ${allEps.length}`);
        if (allEps.length > 0) {
          console.log(`📋 Global List (first 5):`);
          allEps.slice(0, 5).forEach((ep: any) => console.log(`   - Group: ${ep.group_id || ep.group_ids}, Body: ${ep.body?.substring(0, 30)}`));
        }
      }
      episodes = [];
    }

    console.log(`\n📊 Results:`);
    console.log(`   Episodes found: ${episodes.length}`);

    if (episodes.length > 0) {
      console.log(`✅ SUCCESS: Found ${episodes.length} episodes.`);
      episodes.forEach((ep: any, i: number) => {
        const body = ep.body || ep.content || ep.episode_body || "Empty";
        console.log(`   [${i + 1}] Body: ${body.substring(0, 50)}...`);
      });
    } else {
      console.log(`❌ FAILURE: No episodes found for the test session.`);

      // Try fetching all groups to see if it landed elsewhere
      console.log(`\n🔍 Debug: Inspecting all groups (if possible via any session)...`);
      // Since we don't have a 'list_all' we can only speculate or check if ensureSession returns something useful
    }

  } catch (e: any) {
    console.error(`\n❌ Test failed with error: ${e.message}`);
    if (e.stack) console.error(e.stack);
  }
}

main();
