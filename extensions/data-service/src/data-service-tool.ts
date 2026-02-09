/**
 * Aggregates all Data-Service connector tools into a single array.
 */

import type { DataServiceConfig } from "./config.js";
import { createCoworkerListTool } from "./tool-coworker-list.js";
import {
  createConnectorActionsTool,
  createConnectorListTool,
  createConnectorLookupTool,
  createConnectorSchemaTool,
  createUserConnectorsTool,
} from "./tool-discovery.js";
import { createConnectorExecuteTool } from "./tool-execute.js";
import { createConnectorSearchTool } from "./tool-search.js";

/** Create all 8 Data-Service connector tools for the given config. */
export function createDataServiceTools(dsConfig: DataServiceConfig) {
  return [
    createConnectorSearchTool(dsConfig),
    createConnectorExecuteTool(dsConfig),
    createConnectorListTool(dsConfig),
    createConnectorActionsTool(dsConfig),
    createConnectorSchemaTool(dsConfig),
    createConnectorLookupTool(dsConfig),
    createUserConnectorsTool(dsConfig),
    createCoworkerListTool(dsConfig),
  ];
}
