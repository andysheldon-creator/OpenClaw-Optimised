---
name: bigquery-mcp
description: Multi-tenant Google BigQuery integration using Model Context Protocol. Query and analyze data warehouse with organization/workspace/team isolation.
user-invocable: false
requires.env:
  - MONGODB_URL
  - BIGQUERY_MCP_URL
---

# BigQuery MCP Integration

Execute SQL queries and analyze data in Google BigQuery with multi-tenant security. Each tenant's BigQuery credentials (service account JSON) are stored securely in MongoDB.

## Architecture

- **Tenant Context**: organizationId → workspaceId → teamId → userId
- **Credential Storage**: MongoDB with service account JSON keys
- **Transport**: HTTP/JSON-RPC to BigQuery MCP server
- **Server URL**: Configured via `BIGQUERY_MCP_URL` environment variable

## Available Tools

### Query Execution
- `bigquery_execute_query` - Execute SQL queries
- `bigquery_run_query` - Run parameterized queries
- `bigquery_get_query_results` - Fetch query results

### Dataset Management
- `bigquery_list_datasets` - List available datasets
- `bigquery_get_dataset` - Get dataset metadata
- `bigquery_create_dataset` - Create new dataset

### Table Operations
- `bigquery_list_tables` - List tables in dataset
- `bigquery_get_table` - Get table schema and metadata
- `bigquery_create_table` - Create new table
- `bigquery_insert_rows` - Insert data into table

### Schema & Metadata
- `bigquery_get_schema` - Get table schema
- `bigquery_list_jobs` - List query jobs
- `bigquery_get_job` - Get job status

## Usage Pattern

### 1. Setup Tenant Context

```typescript
import { ContextManager } from '../src/mcp-integration/context-manager.js';

const contextManager = new ContextManager();
const tenantContext = contextManager.extractTenantContext({
  peerId: session.peerId,
  channel: session.channel,
  metadata: session.metadata
});

if (!tenantContext) {
  throw new Error('Missing tenant context');
}
```

### 2. Execute Queries

```typescript
import { MCPClient } from '../src/mcp-integration/mcp-client.js';
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

const mcpClient = new MCPClient({
  credentialManager,
  bigqueryMcpUrl: process.env.BIGQUERY_MCP_URL
});

// Execute analytics query
const result = await mcpClient.callTool(
  tenantContext,
  'bigquery',
  'bigquery_execute_query',
  {
    projectId: 'my-project',
    query: `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_orders,
        SUM(amount) as revenue
      FROM \`my-dataset.orders\`
      WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY date
      ORDER BY date DESC
    `,
    useLegacySql: false
  }
);

if (result.success) {
  console.log('Query results:', result.data);
}
```

### 3. Table Operations

```typescript
// List tables in a dataset
const tablesResult = await mcpClient.callTool(
  tenantContext,
  'bigquery',
  'bigquery_list_tables',
  {
    projectId: 'my-project',
    datasetId: 'analytics'
  }
);

// Get table schema
const schemaResult = await mcpClient.callTool(
  tenantContext,
  'bigquery',
  'bigquery_get_schema',
  {
    projectId: 'my-project',
    datasetId: 'analytics',
    tableId: 'events'
  }
);
```

## Credential Setup

Users must provide a Google Cloud service account JSON key:

### 1. Create Service Account

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Create service account with BigQuery roles:
   - `BigQuery Data Viewer` (read-only)
   - `BigQuery Job User` (execute queries)
   - `BigQuery Data Editor` (write access, if needed)
3. Create and download JSON key

### 2. Store Credentials

```typescript
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';
import fs from 'fs';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

const serviceAccountJson = fs.readFileSync('service-account.json', 'utf8');

await credentialManager.setCredentials({
  context: {
    organizationId: 'org_123',
    workspaceId: 'ws_456',
    userId: 'user_abc'
  },
  bigquery: {
    projectId: 'my-gcp-project',
    credentialsJson: serviceAccountJson
  }
});
```

## Multi-Tenant Security

### Project Isolation
- Each tenant can use different GCP projects
- Service accounts are scoped to specific datasets/tables
- No cross-tenant data access

### Query Validation
- SQL queries are executed with tenant-specific credentials
- BigQuery enforces IAM permissions at the GCP level
- No credential sharing between tenants

### Credential Encryption
- Service account JSON stored encrypted in MongoDB
- Never logged or exposed in responses
- Rotatable without code changes

## Example Queries

### Revenue Analytics
```sql
SELECT
  product_category,
  SUM(sale_amount) as total_revenue,
  COUNT(DISTINCT customer_id) as unique_customers,
  AVG(sale_amount) as avg_order_value
FROM `project.dataset.sales`
WHERE sale_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY product_category
ORDER BY total_revenue DESC
LIMIT 10
```

### Customer Cohort Analysis
```sql
WITH cohorts AS (
  SELECT
    customer_id,
    DATE_TRUNC(MIN(purchase_date), MONTH) as cohort_month
  FROM `project.dataset.purchases`
  GROUP BY customer_id
)
SELECT
  cohort_month,
  COUNT(DISTINCT c.customer_id) as cohort_size,
  COUNT(DISTINCT p.customer_id) as active_customers,
  ROUND(COUNT(DISTINCT p.customer_id) / COUNT(DISTINCT c.customer_id) * 100, 2) as retention_rate
FROM cohorts c
LEFT JOIN `project.dataset.purchases` p
  ON c.customer_id = p.customer_id
  AND p.purchase_date >= cohort_month
GROUP BY cohort_month
ORDER BY cohort_month DESC
```

### Pipeline Performance
```sql
SELECT
  pipeline_stage,
  COUNT(*) as deal_count,
  SUM(deal_value) as total_value,
  AVG(days_in_stage) as avg_days,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count,
  ROUND(SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as win_rate
FROM `project.dataset.pipeline_metrics`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
GROUP BY pipeline_stage
ORDER BY total_value DESC
```

## Best Practices

1. **Use parameterized queries** to prevent SQL injection
2. **Limit result sets** with LIMIT clauses for performance
3. **Cache frequently used queries** to reduce costs
4. **Use table partitioning** for large datasets
5. **Monitor query costs** via BigQuery's INFORMATION_SCHEMA
6. **Set up cost controls** with custom quotas per project
7. **Use clustering** for better query performance

## Cost Optimization

### Query Cost Calculation
```sql
-- Estimate query cost before running
SELECT
  ROUND(SUM(size_bytes) / POW(10, 12), 2) as tb_processed,
  ROUND(SUM(size_bytes) / POW(10, 12) * 5, 2) as estimated_cost_usd
FROM `project.dataset.INFORMATION_SCHEMA.TABLES`
WHERE table_name IN ('table1', 'table2')
```

### Best Practices
- Use `SELECT specific_columns` instead of `SELECT *`
- Filter with `WHERE` clause to reduce data scanned
- Use partitioned tables with partition filters
- Enable query caching for repeated queries
- Use approximate aggregation functions (`APPROX_COUNT_DISTINCT`)

## Error Handling

```typescript
const result = await mcpClient.callTool(context, 'bigquery', toolName, args);

if (!result.success) {
  if (result.error?.includes('credentials')) {
    console.log('Invalid or missing BigQuery credentials');
  } else if (result.error?.includes('quota')) {
    console.log('BigQuery quota exceeded');
  } else if (result.error?.includes('permission')) {
    console.log('Service account lacks required permissions');
  } else if (result.error?.includes('syntax')) {
    console.log('SQL syntax error:', result.error);
  } else {
    console.error('BigQuery error:', result.error);
  }
}
```

## Environment Variables

```bash
# Required
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/openclaw_mcp
BIGQUERY_MCP_URL=http://your-bigquery-mcp-server.com/mcp

# Optional (for local development)
BIGQUERY_PROJECT_ID=default-project-id
```

## Troubleshooting

### "Invalid credentials"
- Verify service account JSON is valid
- Check that service account has BigQuery permissions
- Ensure credentials are stored for correct org/workspace/user

### "Access denied to table"
- Service account needs appropriate IAM roles
- Check dataset/table-level permissions
- Verify project ID matches service account project

### "Query timeout"
- Query is too complex or dataset too large
- Add WHERE clauses to reduce data scanned
- Use table partitioning and clustering
- Consider breaking into smaller queries

### Connection errors
- Check BIGQUERY_MCP_URL is accessible
- Verify MCP server is running
- Check network connectivity and firewall rules

## Integration Examples

### With HubSpot Data
```typescript
// Get deals from HubSpot
const dealsResult = await mcpClient.callTool(
  tenantContext,
  'hubspot',
  'hubspot_list_deals',
  { limit: 100 }
);

// Analyze in BigQuery
const analysisResult = await mcpClient.callTool(
  tenantContext,
  'bigquery',
  'bigquery_execute_query',
  {
    query: `
      SELECT
        deal_stage,
        COUNT(*) as count,
        AVG(deal_amount) as avg_amount
      FROM \`project.hubspot_data.deals\`
      WHERE created_date >= CURRENT_DATE() - 30
      GROUP BY deal_stage
    `
  }
);
```

## Related Skills

- `hubspot-mcp` - CRM data source for analytics
- `mongodb-mcp` - Document database queries
- `qdrant-mcp` - Vector similarity search
- `mem0-memory` - Context storage
