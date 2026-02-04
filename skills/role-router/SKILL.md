---
name: role-router
description: Tools for role-based access control and routing.
---

# Role Router Skill

This skill enables agents to respect organizational hierarchy and security policies by validating permissions before taking sensitive actions.

## Tools

### `check_permission`

Verifies if a specific role is allowed to perform a given action.

**Arguments:**

- `role` (string): The role to check (e.g., admin, manager, sales_rep).
- `action` (string): The action being attempted.

### `get_role_hierarchy`

Returns the definition of roles and permissions.

**Returns:**

- Object containing the permission matrix.
