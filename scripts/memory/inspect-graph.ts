import { GraphService } from "../../src/services/memory/GraphService.js";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: node --import tsx scripts/memory/inspect-graph.ts <sessionId>");
    process.exit(1);
  }

  const graph = new GraphService();
  console.log(`\n🔍 Inspecting Graph for Session: ${sessionId}\n`);

  try {
    const story = await graph.getStory(sessionId);
    console.log("--- NARRATIVE STORY ---");
    if (story) {
      console.log(`Updated At: ${story.updatedAt.toISOString()}`);
      console.log(`Content:\n${story.content}`);
    } else {
      console.log("No narrative story found.");
    }

    console.log("\n--- RECENT EPISODES ---");
    // Show all episodes (threshold 0)
    const episodes = await graph.getEpisodesSince(sessionId, new Date(0), 1000);
    console.log(`Total episodes found: ${episodes.length}`);

    episodes.forEach((ep: any, i: number) => {
      const body = ep.body || ep.content || ep.episode_body || "Empty";
      const time = ep.created_at || "Unknown time";
      console.log(`\n[${i + 1}] (${time})`);
      console.log(body);
    });

  } catch (e: any) {
    console.error(`\n❌ Inspection failed: ${e.message}`);
  }
}

main();
