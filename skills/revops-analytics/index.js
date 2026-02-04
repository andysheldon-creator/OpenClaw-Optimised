const { z } = require("zod");

module.exports = {
  id: "revops-analytics",
  name: "RevOps Analytics",
  description: "Tools for tracking business events and retrieving Revenue Operations metrics.",
  register(api) {
    // In-memory store for demonstration/mocking purposes
    const eventLog = [];

    api.registerTool({
      name: "track_event",
      description:
        "Log a significant business event for analytics (e.g., deal stage change, high value interaction).",
      schema: z.object({
        event_name: z.string().describe("Name of the event (e.g., 'deal_moved_to_closed_won')."),
        properties: z.record(z.any()).describe("Key-value pairs describing the event details."),
        timestamp: z.string().optional().describe("ISO timestamp of the event. Defaults to now."),
      }),
      func: async (args) => {
        const entry = {
          id: Math.random().toString(36).substring(7),
          name: args.event_name,
          props: args.properties,
          ts: args.timestamp || new Date().toISOString(),
        };
        eventLog.push(entry);

        return {
          status: "recorded",
          id: entry.id,
          message: `Event '${args.event_name}' tracked successfully.`,
        };
      },
    });

    api.registerTool({
      name: "get_kpi_metrics",
      description: "Retrieve aggregated KPI metrics for a given time period.",
      schema: z.object({
        metric_type: z
          .enum(["pipeline_value", "conversion_rate", "deals_closed", "activity_volume"])
          .describe("The type of metric to retrieve."),
        period: z.enum(["day", "week", "month", "quarter"]).default("week"),
      }),
      func: async (args) => {
        // Mock data generator based on args
        let value = 0;
        let unit = "";

        switch (args.metric_type) {
          case "pipeline_value":
            value = Math.floor(Math.random() * 500000) + 100000;
            unit = "USD";
            break;
          case "conversion_rate":
            value = (Math.random() * 0.3 + 0.1).toFixed(2);
            unit = "%";
            break;
          case "deals_closed":
            value = Math.floor(Math.random() * 20);
            unit = "count";
            break;
          case "activity_volume":
            value = Math.floor(Math.random() * 500);
            unit = "events";
            break;
        }

        return {
          metric: args.metric_type,
          period: args.period,
          value: value,
          unit: unit,
          trend: Math.random() > 0.5 ? "up" : "down",
          generated_at: new Date().toISOString(),
        };
      },
    });
  },
};
