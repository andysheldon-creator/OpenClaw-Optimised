---
name: qdrant-mcp
description: Multi-tenant Qdrant vector database integration using Model Context Protocol. Semantic search and vector similarity with organization/workspace/team isolation.
user-invocable: false
requires.env:
  - MONGODB_URL
  - QDRANT_MCP_URL
---

# Qdrant MCP Integration

Perform semantic search and vector similarity queries in Qdrant with multi-tenant security. Each tenant's Qdrant API keys and collection names are stored securely in MongoDB.

## Architecture

- **Tenant Context**: organizationId → workspaceId → teamId → userId
- **Credential Storage**: MongoDB with API keys and collection mappings
- **Transport**: SSE (Server-Sent Events) using MCP SDK
- **Server URL**: Configured via `QDRANT_MCP_URL` environment variable

## Available Tools

### Vector Operations
- `qdrant_search` - Semantic similarity search
- `qdrant_insert` - Insert vectors with metadata
- `qdrant_update` - Update vector metadata
- `qdrant_delete` - Delete vectors by ID
- `qdrant_scroll` - Paginate through collection

### Collection Management
- `qdrant_list_collections` - List available collections
- `qdrant_get_collection` - Get collection info
- `qdrant_create_collection` - Create new collection
- `qdrant_delete_collection` - Delete collection

### Point Operations
- `qdrant_retrieve` - Get specific points by ID
- `qdrant_count` - Count points in collection
- `qdrant_recommend` - Get similar vectors

### Filtering & Querying
- `qdrant_filter` - Filter by metadata
- `qdrant_query` - Advanced query with conditions

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

### 2. Semantic Search

```typescript
import { MCPClient } from '../src/mcp-integration/mcp-client.js';
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

const mcpClient = new MCPClient({
  credentialManager,
  qdrantMcpUrl: process.env.QDRANT_MCP_URL
});

// Search for similar documents
const searchResult = await mcpClient.callTool(
  tenantContext,
  'qdrant',
  'qdrant_search',
  {
    collection: 'customer_documents',
    query_vector: embeddingVector, // 384-dim or 1536-dim array
    limit: 10,
    with_payload: true,
    with_vector: false,
    score_threshold: 0.7
  }
);

if (searchResult.success) {
  const results = searchResult.content;
  console.log('Found similar documents:', results);
}
```

### 3. Insert Embeddings

```typescript
// Insert document with vector embedding
const insertResult = await mcpClient.callTool(
  tenantContext,
  'qdrant',
  'qdrant_insert',
  {
    collection: 'customer_documents',
    points: [
      {
        id: 'doc_12345',
        vector: embeddingVector,
        payload: {
          title: 'Q1 Sales Report',
          category: 'reports',
          date: '2024-03-15',
          author: 'john.doe',
          content_preview: 'Q1 revenue exceeded targets...'
        }
      }
    ]
  }
);
```

### 4. Filter by Metadata

```typescript
// Find documents by metadata filter
const filterResult = await mcpClient.callTool(
  tenantContext,
  'qdrant',
  'qdrant_filter',
  {
    collection: 'customer_documents',
    filter: {
      must: [
        { key: 'category', match: { value: 'reports' } },
        { key: 'date', range: { gte: '2024-01-01', lte: '2024-03-31' } }
      ]
    },
    limit: 20
  }
);
```

## Credential Setup

### 1. Store Qdrant API Key

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
  qdrant: {
    apiKey: 'qdrant-api-key-xyz',
    collectionName: 'org_123_ws_456_documents'
  }
});
```

### 2. Collection Naming Convention

Use organization and workspace IDs in collection names for isolation:

```
{organizationId}_{workspaceId}_{collectionType}

Examples:
- org_acme_ws_sales_documents
- org_acme_ws_sales_conversations
- org_techco_ws_marketing_emails
```

## Multi-Tenant Security

### Collection Isolation
- Each organization/workspace has separate collections
- Collection names include tenant IDs
- No cross-tenant vector search possible

### API Key Management
- Each tenant can use different Qdrant API keys
- Keys are encrypted in MongoDB
- Supports multiple Qdrant clusters per deployment

### Access Control
- MCP client validates tenant context before queries
- Collection access restricted by API key permissions
- Qdrant enforces authentication at cluster level

## Vector Embeddings

### Common Models

#### OpenAI text-embedding-3-small (1536 dimensions)
```typescript
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Your text here'
});
const vector = response.data[0].embedding;
```

#### OpenAI text-embedding-3-large (3072 dimensions)
```typescript
const response = await openai.embeddings.create({
  model: 'text-embedding-3-large',
  input: 'Your text here'
});
const vector = response.data[0].embedding;
```

#### Sentence Transformers (384 dimensions)
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
vector = model.encode('Your text here').tolist()
```

## Use Cases

### Document Search
```typescript
// Index customer documents
await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
  collection: 'customer_documents',
  points: documents.map(doc => ({
    id: doc.id,
    vector: doc.embedding,
    payload: {
      title: doc.title,
      content: doc.content,
      category: doc.category,
      created_at: doc.created_at
    }
  }))
});

// Semantic search
const query = "What were our Q1 sales targets?";
const queryEmbedding = await getEmbedding(query);

const results = await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_search', {
  collection: 'customer_documents',
  query_vector: queryEmbedding,
  limit: 5,
  with_payload: true
});
```

### Conversation Memory
```typescript
// Store conversation context
await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
  collection: 'conversation_history',
  points: [{
    id: `msg_${timestamp}`,
    vector: messageEmbedding,
    payload: {
      user_id: userId,
      message: userMessage,
      response: assistantResponse,
      timestamp: new Date().toISOString(),
      channel: 'whatsapp'
    }
  }]
});

// Find similar past conversations
const similarConvs = await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_search', {
  collection: 'conversation_history',
  query_vector: currentMessageEmbedding,
  limit: 3,
  filter: {
    must: [
      { key: 'user_id', match: { value: userId } }
    ]
  }
});
```

### Product Recommendations
```typescript
// Find similar products
const productResult = await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_recommend', {
  collection: 'products',
  positive: [productId], // Product ID user liked
  negative: [], // Products to exclude
  limit: 10,
  with_payload: true
});
```

### Customer Segmentation
```typescript
// Create customer embeddings from behavior
await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
  collection: 'customer_profiles',
  points: customers.map(c => ({
    id: c.customer_id,
    vector: c.behavior_embedding,
    payload: {
      segment: c.segment,
      lifetime_value: c.ltv,
      last_purchase: c.last_purchase_date
    }
  }))
});

// Find similar customers for targeting
const similarCustomers = await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_search', {
  collection: 'customer_profiles',
  query_vector: highValueCustomerEmbedding,
  limit: 50,
  score_threshold: 0.8
});
```

## Best Practices

1. **Use consistent embedding models** across insert and search
2. **Normalize vectors** if using cosine similarity
3. **Set appropriate score thresholds** (0.7-0.9 for high quality)
4. **Include rich metadata** in payload for filtering
5. **Batch insert operations** (up to 1000 points per request)
6. **Use collection prefixes** for tenant isolation
7. **Monitor collection sizes** and plan for scaling

## Performance Optimization

### Collection Configuration
```typescript
// Create optimized collection
await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_create_collection', {
  collection: 'customer_documents',
  vectors: {
    size: 1536,
    distance: 'Cosine' // or 'Euclid', 'Dot'
  },
  optimizers_config: {
    indexing_threshold: 20000
  },
  hnsw_config: {
    m: 16,
    ef_construct: 100
  }
});
```

### Filtering Optimization
- Use indexed payload fields for filters
- Combine filters in `must` clause when possible
- Avoid complex nested filters for better performance

### Batch Operations
```typescript
// Batch insert for better performance
const BATCH_SIZE = 100;
for (let i = 0; i < allPoints.length; i += BATCH_SIZE) {
  const batch = allPoints.slice(i, i + BATCH_SIZE);
  await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
    collection: 'documents',
    points: batch
  });
}
```

## Error Handling

```typescript
const result = await mcpClient.callTool(context, 'qdrant', toolName, args);

if (!result.success || result.isError) {
  const error = result.error || result.content?.[0]?.text;

  if (error?.includes('collection not found')) {
    console.log('Collection does not exist. Create it first.');
  } else if (error?.includes('dimension')) {
    console.log('Vector dimension mismatch');
  } else if (error?.includes('authentication')) {
    console.log('Invalid Qdrant API key');
  } else {
    console.error('Qdrant error:', error);
  }
}
```

## Environment Variables

```bash
# Required
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/openclaw_mcp
QDRANT_MCP_URL=http://your-qdrant-mcp-server.com/sse

# Optional (for embedding generation)
OPENAI_API_KEY=sk-...
```

## Troubleshooting

### "Collection not found"
- Create collection first using `qdrant_create_collection`
- Verify collection name matches credential configuration
- Check Qdrant cluster is accessible

### "Vector dimension mismatch"
- Ensure embedding model dimensions match collection config
- Check vector array length before insertion
- Verify collection was created with correct vector size

### "Authentication failed"
- Verify API key is valid and not expired
- Check API key has permissions for the collection
- Ensure credentials are stored for correct tenant

### "Score threshold too high"
- Lower score_threshold parameter (try 0.7 instead of 0.9)
- Check embedding quality and model selection
- Verify vectors are normalized if using cosine similarity

## Integration Examples

### With Mem0 Memory
```typescript
// Store conversation in both Mem0 and Qdrant
await mem0.add(conversationText, userId);

const embedding = await getEmbedding(conversationText);
await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
  collection: 'conversation_vectors',
  points: [{
    id: conversationId,
    vector: embedding,
    payload: { userId, text: conversationText, timestamp: Date.now() }
  }]
});
```

### With HubSpot Data
```typescript
// Index HubSpot deals for semantic search
const deals = await mcpClient.callTool(tenantContext, 'hubspot', 'hubspot_list_deals', {});

for (const deal of deals.data) {
  const dealText = `${deal.dealname} ${deal.description}`;
  const embedding = await getEmbedding(dealText);

  await mcpClient.callTool(tenantContext, 'qdrant', 'qdrant_insert', {
    collection: 'hubspot_deals',
    points: [{
      id: deal.id,
      vector: embedding,
      payload: deal
    }]
  });
}
```

## Related Skills

- `hubspot-mcp` - CRM data for vectorization
- `bigquery-mcp` - Analytics on vector search results
- `mongodb-mcp` - Document storage
- `mem0-memory` - Multi-scope conversation memory
