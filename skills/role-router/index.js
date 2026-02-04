const { z } = require("zod");

// Lazy load internal modules if needed (none strictly needed for this mock logic)
// In a real app, this would likely fetch roles from a database via a service

module.exports = {
  id: "role-router",
  name: "Role Router",
  description: "Utilities for routing requests and validating permissions based on user roles.",
  register(api) {
    // Mock Permission Matrix
    const PERMISSIONS = {
      admin: ["*"],
      manager: ["view_analytics", "manage_users", "approve_deals"],
      sales_rep: ["view_analytics", "manage_deals"],
      viewer: ["view_analytics"],
    };

    api.registerTool({
      name: "check_permission",
      description:
        "Check if the current user (or a specified role) has permission to perform an action.",
      schema: z.object({
        role: z.string().describe("The user's role (e.g., 'admin', 'sales_rep')."),
        action: z.string().describe("The action to perform (e.g., 'approve_deals')."),
      }),
      func: async (args) => {
        const userRole = args.role.toLowerCase();
        const action = args.action.toLowerCase();

        const allowedActions = PERMISSIONS[userRole] || [];
        const isAllowed = allowedActions.includes("*") || allowedActions.includes(action);

        return {
          allowed: isAllowed,
          role: userRole,
          requested_action: action,
          reason: isAllowed ? "Access granted by role policy." : "Insufficient permissions.",
        };
      },
    });

    api.registerTool({
      name: "get_role_hierarchy",
      description: "Get the list of available roles and their capabilities.",
      schema: z.object({}),
      func: async () => {
        return {
          roles: Object.keys(PERMISSIONS),
          matrix: PERMISSIONS,
        };
      },
    });
  },
};
