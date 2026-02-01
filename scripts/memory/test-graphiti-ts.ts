import { GraphService } from "../../src/services/memory/GraphService.js";

async function main() {
  const graph = new GraphService();
  const sessionId = "test-timestamp-support-" + Math.random().toString(36).substring(7);
  const oldDate = "2020-01-01T12:00:00.000Z";

  console.log(`🧪 Testing custom created_at support...`);
  console.log(`📡 Sending episode with created_at: ${oldDate}`);

  const mcpId = await (graph as any).ensureSession();
  const res = await fetch(`${(graph as any).mcpBaseURL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": mcpId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "test-ts",
      method: "tools/call",
      params: {
        name: "add_memory",
        arguments: {
          name: "Timestamp Test",
          episode_body: "This is a test of custom timestamp support.",
          group_id: sessionId,
          created_at: oldDate // The field we hope works
        }
      }
    })
  });

  const responseText = await res.text();
  console.log(`📥 Response: ${responseText}`);

  console.log(`\n⏳ Waiting 30s for indexing...`);
  await new Promise(r => setTimeout(r, 30000));

  console.log(`🔍 Querying episodes to see metadata...`);
  const episodesRes = await fetch(`${(graph as any).mcpBaseURL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "mcp-session-id": mcpId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "test-list",
      method: "tools/call",
      params: {
        name: "get_episodes",
        arguments: { group_ids: [sessionId] }
      }
    })
  });

  const listText = await episodesRes.text();
  const data = (graph as any).parseSSEResult(listText);
  const episodes = JSON.parse(data?.result?.content?.[0]?.text || "{}").episodes || [];

  if (episodes.length > 0) {
    const ep = episodes[0];
    console.log(`📊 Episode Metadata:`);
    console.log(`   - created_at in result: ${ep.created_at}`);
    if (ep.created_at.startsWith("2020")) {
      console.log(`✅ SUCCESS: Graphiti honors the passed created_at field!`);
    } else {
      console.log(`❌ FAILURE: Graphiti used server time (${ep.created_at}) instead of ${oldDate}.`);
    }
  } else {
    console.log(`⚠️ No episode found. Indexing might be slower.`);
  }
}

main();
