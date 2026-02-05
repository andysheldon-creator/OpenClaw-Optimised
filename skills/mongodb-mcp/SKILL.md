---
name: mongodb-mcp
description: Multi-tenant MongoDB integration using Model Context Protocol. Query and manipulate document databases with organization/workspace/team isolation.
user-invocable: false
requires.env:
  - MONGODB_URL
---

# MongoDB MCP Integration

Access MongoDB document databases with multi-tenant security. Each tenant's MongoDB connection strings and database configurations are stored securely.

## Architecture

- **Tenant Context**: organizationId → workspaceId → teamId → userId
- **Credential Storage**: MongoDB with connection strings per tenant
- **Isolation**: Database-level or collection-level segregation
- **Transport**: Direct MongoDB driver connections

## Available Operations

### Document Operations
- `mongodb_find` - Query documents
- `mongodb_findOne` - Find single document
- `mongodb_insertOne` - Insert document
- `mongodb_insertMany` - Bulk insert
- `mongodb_updateOne` - Update single document
- `mongodb_updateMany` - Bulk update
- `mongodb_deleteOne` - Delete document
- `mongodb_deleteMany` - Bulk delete

### Aggregation
- `mongodb_aggregate` - Run aggregation pipeline
- `mongodb_count` - Count documents
- `mongodb_distinct` - Get distinct values

### Collection Management
- `mongodb_listCollections` - List collections
- `mongodb_createCollection` - Create collection
- `mongodb_dropCollection` - Delete collection
- `mongodb_createIndex` - Create index

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
```

### 2. Query Documents

```typescript
import { MCPClient } from '../src/mcp-integration/mcp-client.js';
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

// Note: This is the credential manager's MongoDB, not tenant MongoDB
// Tenant MongoDB access would use stored credentials

// Find customer orders
const result = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_find',
  {
    database: 'customer_data',
    collection: 'orders',
    filter: {
      status: 'pending',
      created_at: { $gte: new Date('2024-01-01') }
    },
    projection: {
      order_id: 1,
      customer_name: 1,
      total_amount: 1,
      status: 1
    },
    limit: 100
  }
);

if (result.success) {
  console.log('Found orders:', result.data);
}
```

### 3. Aggregation Pipelines

```typescript
// Revenue by product category
const aggregateResult = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_aggregate',
  {
    database: 'analytics',
    collection: 'sales',
    pipeline: [
      {
        $match: {
          sale_date: { $gte: new Date('2024-01-01') }
        }
      },
      {
        $group: {
          _id: '$category',
          total_revenue: { $sum: '$amount' },
          order_count: { $sum: 1 },
          avg_order_value: { $avg: '$amount' }
        }
      },
      {
        $sort: { total_revenue: -1 }
      },
      {
        $limit: 10
      }
    ]
  }
);
```

### 4. Insert/Update Operations

```typescript
// Insert customer record
const insertResult = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_insertOne',
  {
    database: 'customer_data',
    collection: 'customers',
    document: {
      customer_id: 'cust_12345',
      name: 'Acme Corp',
      email: 'contact@acme.com',
      created_at: new Date(),
      metadata: {
        industry: 'Technology',
        employees: 500
      }
    }
  }
);

// Update customer
const updateResult = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_updateOne',
  {
    database: 'customer_data',
    collection: 'customers',
    filter: { customer_id: 'cust_12345' },
    update: {
      $set: {
        email: 'newemail@acme.com',
        updated_at: new Date()
      },
      $inc: {
        'metadata.employees': 50
      }
    }
  }
);
```

## Credential Setup

### 1. Database-Level Isolation

Each tenant gets their own database on shared cluster:

```typescript
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

await credentialManager.setCredentials({
  context: {
    organizationId: 'org_123',
    workspaceId: 'ws_456',
    userId: 'user_abc'
  },
  mongodb: {
    connectionString: 'mongodb+srv://user:pass@cluster.mongodb.net/',
    database: 'org_123_ws_456' // Tenant-specific database
  }
});
```

### 2. Collection-Level Isolation

Shared database with prefixed collections:

```typescript
await credentialManager.setCredentials({
  context: {
    organizationId: 'org_123',
    workspaceId: 'ws_456',
    userId: 'user_abc'
  },
  mongodb: {
    connectionString: 'mongodb+srv://user:pass@cluster.mongodb.net/',
    database: 'shared_database'
    // Collections will use prefix: org_123_ws_456_orders, org_123_ws_456_customers
  }
});
```

### 3. Cluster-Level Isolation

Each tenant gets dedicated cluster:

```typescript
await credentialManager.setCredentials({
  context: {
    organizationId: 'org_enterprise',
    workspaceId: 'ws_production',
    userId: 'user_abc'
  },
  mongodb: {
    connectionString: 'mongodb+srv://user:pass@dedicated-cluster.mongodb.net/',
    database: 'production_data'
  }
});
```

## Multi-Tenant Security

### Database Segregation
- Separate databases per organization/workspace
- MongoDB enforces database-level access control
- No cross-database queries possible

### Collection Naming
```
{organizationId}_{workspaceId}_{collectionName}

Examples:
- org_acme_ws_sales_orders
- org_acme_ws_sales_customers
- org_techco_ws_marketing_leads
```

### Connection Pooling
- Each tenant connection is pooled separately
- Credentials rotated without service interruption
- Connection limits per tenant configurable

### Query Validation
```typescript
// Always validate tenant context
const contextManager = new ContextManager();
if (!contextManager.validateTenantContext(tenantContext)) {
  throw new Error('Invalid tenant context');
}

// Add tenant filter to all queries
const query = {
  ...userFilter,
  _tenant: {
    organizationId: tenantContext.organizationId,
    workspaceId: tenantContext.workspaceId
  }
};
```

## Common Queries

### Customer Analytics
```typescript
// Active customers in last 30 days
const activeCustomers = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_aggregate',
  {
    database: 'analytics',
    collection: 'customer_activity',
    pipeline: [
      {
        $match: {
          last_activity: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$segment',
          count: { $sum: 1 },
          avg_lifetime_value: { $avg: '$lifetime_value' }
        }
      }
    ]
  }
);
```

### Order Processing
```typescript
// Pending orders with details
const pendingOrders = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_find',
  {
    database: 'ecommerce',
    collection: 'orders',
    filter: {
      status: 'pending',
      created_at: { $gte: new Date('2024-01-01') }
    },
    sort: { created_at: -1 },
    limit: 50
  }
);

// Update order status
await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_updateMany',
  {
    database: 'ecommerce',
    collection: 'orders',
    filter: {
      status: 'pending',
      payment_received: true
    },
    update: {
      $set: {
        status: 'processing',
        updated_at: new Date()
      }
    }
  }
);
```

### User Activity Tracking
```typescript
// Log user action
await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_insertOne',
  {
    database: 'analytics',
    collection: 'user_events',
    document: {
      user_id: tenantContext.userId,
      event_type: 'page_view',
      page: '/dashboard',
      timestamp: new Date(),
      metadata: {
        device: 'mobile',
        session_id: 'sess_xyz'
      }
    }
  }
);

// Get user activity summary
const activitySummary = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_aggregate',
  {
    database: 'analytics',
    collection: 'user_events',
    pipeline: [
      {
        $match: {
          user_id: tenantContext.userId,
          timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$event_type',
          count: { $sum: 1 }
        }
      }
    ]
  }
);
```

## Best Practices

1. **Always use indexes** for frequently queried fields
2. **Limit query results** to prevent memory issues
3. **Use projection** to return only needed fields
4. **Implement pagination** for large result sets
5. **Add tenant filters** to all queries for security
6. **Use connection pooling** for better performance
7. **Monitor slow queries** and optimize indexes

## Performance Optimization

### Index Creation
```typescript
// Create compound index
await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_createIndex',
  {
    database: 'customer_data',
    collection: 'orders',
    keys: {
      status: 1,
      created_at: -1
    },
    options: {
      name: 'status_created_idx'
    }
  }
);

// Create text index for search
await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_createIndex',
  {
    database: 'customer_data',
    collection: 'products',
    keys: {
      name: 'text',
      description: 'text'
    }
  }
);
```

### Aggregation Optimization
- Use `$match` early in pipeline to reduce documents
- Use indexes with `$match` and `$sort`
- Avoid `$lookup` on large collections
- Use `$limit` after `$sort` for top-N queries

### Query Patterns
```typescript
// Good: Indexed query with projection
const goodQuery = {
  filter: { status: 'active', created_at: { $gte: recentDate } },
  projection: { _id: 1, name: 1, email: 1 },
  limit: 100
};

// Avoid: Full collection scan without projection
const badQuery = {
  filter: {},  // No filter = full scan
  // No projection = returns all fields
  // No limit = returns all documents
};
```

## Error Handling

```typescript
const result = await mcpClient.callTool(context, 'mongodb', toolName, args);

if (!result.success) {
  if (result.error?.includes('connection')) {
    console.log('MongoDB connection failed. Check credentials.');
  } else if (result.error?.includes('duplicate key')) {
    console.log('Document with this key already exists');
  } else if (result.error?.includes('authentication')) {
    console.log('Invalid MongoDB credentials');
  } else if (result.error?.includes('namespace')) {
    console.log('Database or collection does not exist');
  } else {
    console.error('MongoDB error:', result.error);
  }
}
```

## Environment Variables

```bash
# Required
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/openclaw_mcp

# Optional (for tenant databases)
MONGODB_TENANT_CLUSTER=mongodb+srv://user:pass@tenant-cluster.mongodb.net/
```

## Troubleshooting

### "Authentication failed"
- Verify connection string credentials
- Check IP whitelist in MongoDB Atlas
- Ensure database user has correct permissions

### "Collection not found"
- Create collection first or enable auto-creation
- Verify database and collection names
- Check tenant context is correct

### "Connection timeout"
- Check network connectivity
- Verify MongoDB cluster is accessible
- Check connection string format
- Ensure firewall allows MongoDB port (27017)

### "Duplicate key error"
- Document with same _id already exists
- Use `updateOne` with `upsert: true` instead
- Check unique index constraints

## Integration Examples

### With HubSpot Sync
```typescript
// Sync HubSpot contacts to MongoDB
const contacts = await mcpClient.callTool(
  tenantContext,
  'hubspot',
  'hubspot_list_contacts',
  { limit: 100 }
);

await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_insertMany',
  {
    database: 'crm_sync',
    collection: 'hubspot_contacts',
    documents: contacts.data.map(c => ({
      ...c,
      synced_at: new Date(),
      source: 'hubspot'
    }))
  }
);
```

### With BigQuery Export
```typescript
// Export MongoDB data to BigQuery
const orders = await mcpClient.callTool(
  tenantContext,
  'mongodb',
  'mongodb_find',
  {
    database: 'ecommerce',
    collection: 'orders',
    filter: { created_at: { $gte: new Date('2024-01-01') } }
  }
);

// Process and load to BigQuery
// (BigQuery bulk load logic here)
```

## Related Skills

- `hubspot-mcp` - CRM data synchronization
- `bigquery-mcp` - Analytics and reporting
- `qdrant-mcp` - Vector embeddings storage
- `mem0-memory` - Conversation context
