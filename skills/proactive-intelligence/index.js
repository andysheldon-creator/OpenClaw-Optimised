import { z } from "zod";

export default {
  id: "proactive-intelligence",
  name: "Proactive Intelligence",
  description:
    "Capabilities for proactive analysis and insights generation without explicit user prompts.",
  register(api) {
    api.registerTool({
      name: "analyze_recent_activity",
      description:
        "Analyze a batch of recent activities or logs to identify patterns, anomalies, or important events that require attention.",
      schema: z.object({
        activities: z
          .array(z.string())
          .describe("List of activity summaries or log entries to analyze"),
        focus_area: z
          .enum(["anomalies", "patterns", "summary", "actionable_insights"])
          .optional()
          .default("summary")
          .describe("The specific type of analysis to perform"),
      }),
      func: async (args) => {
        const count = args.activities.length;

        let result = {
          analyzed_count: count,
          focus: args.focus_area,
          findings: [],
        };

        if (count === 0) {
          return { ...result, status: "no_data" };
        }

        // Simulating basic analysis logic
        if (args.focus_area === "anomalies") {
          // Mock: Flag long items as potential anomalies
          result.findings = args.activities
            .filter((a) => a.length > 100)
            .map((a) => `Potential anomaly (length): ${a.substring(0, 30)}...`);
        } else if (args.focus_area === "summary") {
          result.findings = [`Processed ${count} items. Activity appears normal.`];
        }

        return result;
      },
    });
  },
};
