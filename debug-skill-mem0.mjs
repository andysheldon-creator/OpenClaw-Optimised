import { createRequire } from "module";
const require = createRequire(import.meta.url);
const path = require("path");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

console.log("--- Debugging Mem0 Skill (ESM) ---");
console.log("MEM0_API_KEY present:", !!process.env.MEM0_API_KEY);
console.log("MEM0_ORG_ID:", process.env.MEM0_ORG_ID);

async function testSkill() {
  try {
    const skillPath = path.resolve("./skills/mem0-memory/index.js");
    console.log("Loading skill from:", skillPath);

    // Use dynamic import for ESM
    const module = await import(skillPath);
    const skill = module.default;

    console.log("Skill ID:", skill.id);

    const tools = {};
    const api = {
      logger: {
        info: console.log,
        warn: console.warn,
        error: console.error,
      },
      registerTool: (def) => {
        console.log(`Registered tool: ${def.name}`);
        tools[def.name] = def;
      },
    };

    if (skill.register) {
      await skill.register(api);
    } else {
      console.error("Skill missing register function");
      return;
    }

    if (tools.mem0_add) {
      console.log("Testing mem0_add...");
      const result = await tools.mem0_add.func({
        content: "Debug test: My favorite color is green.",
        scope: "agent",
        metadata: { source: "debug_script" },
      });
      console.log("mem0_add Result:", JSON.stringify(result, null, 2));
    } else {
      console.error("Tool mem0_add not registered!");
    }
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
  }
}

testSkill();
