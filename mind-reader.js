#!/usr/bin/env node

// Minimal polyfill for fetch if needed (Node 18+ has it native)
// Implements a simple interactive CLI to query Graphiti

const GRAPHITI_URL = process.env.GRAPHITI_MCP_URL || "http://localhost:8001";
const SESSION_ID = process.argv[2];

if (!SESSION_ID) {
  console.error("Usage: ./mind-reader.js <session-id> [command] [args]");
  console.error("Commands:");
  console.error("  story           - Show the current Narrative Story");
  console.error("  search <query>  - Search for nodes/memories semantically");
  console.error("  episodes [n]    - Show last N raw episodes (default 10)");
  process.exit(1);
}

const CMD = process.argv[3] || "story";
const ARGS_RAW = process.argv.slice(4);
const MCP_ID_ARG = ARGS_RAW.find((a) => a.startsWith("mcp:"));
const ARGS = ARGS_RAW.filter((a) => !a.startsWith("mcp:")).join(" ");
const FORCED_MCP_ID = MCP_ID_ARG ? MCP_ID_ARG.split(":")[1] : null;

async function callGraphiti(method, params) {
  const payload = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: {
      name: method,
      arguments: params,
    },
  };

  try {
    let mcpSessionId = FORCED_MCP_ID;

    if (!mcpSessionId) {
      // 1. Handshake (MCP Initialize) if no ID provided
      const initPayload = {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "mind-reader-cli", version: "1.0.0" },
        },
      };

      const initRes = await fetch(`${GRAPHITI_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(initPayload),
      });

      // The ID comes in the header
      mcpSessionId = initRes.headers.get("mcp-session-id");

      if (!mcpSessionId) {
        console.error("Failed to Initialize MCP: No Session ID returned.");
        process.exit(1);
      }
    } else {
      console.log(`Using forced MCP Session ID: ${mcpSessionId}`);
    }

    const res = await fetch(`${GRAPHITI_URL}/mcp?sessionId=${mcpSessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": mcpSessionId, // Also add as header just in case
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    // console.log("RAW DEBUG:", text.substring(0, 200)); // Uncomment to debug

    // Parse SSE-like response manually since it's just a quick tool
    const match = text.match(/event: (?:content|message)\s+data: (.+)/);
    if (match) {
      const json = JSON.parse(match[1]);
      return json.result || json;
    }
    // Fallback if not SSE: Standard JSON-RPC response
    try {
      const json = JSON.parse(text);
      if (json.error) {
        console.error("RPC Error:", json.error);
        return { episodes: [] };
      }
      return json.result || json;
    } catch {
      console.error("Failed to parse response:", text.substring(0, 100));
      return { episodes: [] };
    }
  } catch (e) {
    console.error("Connection error:", e.message);
    process.exit(1);
  }
}

// Re-using the logic from GraphService.ts but purely with fetch
async function run() {
  console.log(`🧠 Connecting to Mind at ${GRAPHITI_URL} for session ${SESSION_ID}...\n`);

  if (CMD === "story") {
    // Fetch episodes and find GLOBAL_STORY
    const response = await callGraphiti("get_episodes", { group_id: SESSION_ID });
    console.log("DEBUG RESPONSE:", JSON.stringify(response, null, 2));

    const content = response.content?.[0]?.text;
    if (!content) {
      console.log("No data.");
      return;
    }

    const json = JSON.parse(content);
    const episodes = json.episodes || [];

    const story = episodes
      .filter((e) => e.body && e.body.startsWith("[GLOBAL_STORY]"))
      .toSorted((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (story) {
      console.log("\n📖 === NARRATIVE STORY ===\n");
      console.log(story.body.replace("[GLOBAL_STORY]", "").trim());
      console.log(`\n(Last updated: ${story.created_at})`);
    } else {
      console.log("No Narrative Story found yet.");
    }
  } else if (CMD === "search") {
    if (!ARGS) {
      console.error("Please provide a query.");
      return;
    }

    console.log(`🔎 Searching for: "${ARGS}"...\n`);

    await callGraphiti("search_episodes", { query: ARGS });
    // Note: Graphiti has search_nodes and search_episodes. Let's try nodes first as it's more "memory" like
    // or search_nodes depending on API. GraphService used search_nodes.

    // Actually GraphService uses search_nodes (custom?) or just relies on vector search logic?
    // Let's assume search_episodes for text content which is valid in MCP standard usually.
    // Wait, GraphService.ts used `searchGraph` -> `read_graph` and `searchNodes` -> `search_nodes`.

    const nodesRes = await callGraphiti("search_nodes", {
      query: ARGS,
      group_ids: [SESSION_ID],
      max_nodes: 10,
    });
    console.log("DEBUG nodesRes:", JSON.stringify(nodesRes, null, 2));
    try {
      const parsed = JSON.parse(nodesRes.content[0].text);
      const nodes = parsed.nodes || [];

      console.log(`Found ${nodes.length} matches:\n`);
      nodes.forEach((n, i) => {
        console.log(
          `${i + 1}. [${n.uuid?.substring(0, 6)}] ${n.name || n.summary || JSON.stringify(n)}`,
        );
        // if it has edges, show them
      });
    } catch {
      console.log("Raw response:", nodesRes);
    }
  } else if (CMD === "episodes") {
    const limit = parseInt(ARGS) || 10;
    const response = await callGraphiti("get_episodes", { group_id: SESSION_ID });
    const content = response.content?.[0]?.text;
    if (!content) {
      console.log("No data.");
      return;
    }

    const json = JSON.parse(content);
    let episodes = json.episodes || [];

    // Filter out the story itself to show raw chat
    episodes = episodes.filter((e) => !e.body.startsWith("[GLOBAL_STORY]"));

    // Sort newest first
    episodes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    console.log(`\n📼 === LAST ${limit} EPISODES ===\n`);
    episodes.slice(0, limit).forEach((e) => {
      const date = new Date(e.created_at).toLocaleString();
      console.log(`[${date}] ${e.body.substring(0, 100).replace(/\n/g, " ")}...`);
    });
  } else if (CMD === "raw") {
    const response = await callGraphiti("get_episodes", {});
    console.log("RAW DUMP:", JSON.stringify(response, null, 2));
  } else {
    console.log("Unknown command.");
  }
}

void run();
