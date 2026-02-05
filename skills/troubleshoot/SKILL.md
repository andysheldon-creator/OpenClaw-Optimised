---
name: troubleshoot
description: "Systematic debugging and root cause analysis skill. Uses 5 Whys, timeline analysis, and investigation methodologies to diagnose issues."
metadata: { "openclaw": { "emoji": "🔧", "always": true, "skillKey": "troubleshoot" } }
user-invocable: true
---

# Skill: Troubleshooting

Systematic debugging and root cause analysis.

## Investigation Workflow

### 1. Reproduce

```
Can I reproduce the issue?
|
+-- YES --> Document reproduction steps
|
+-- NO --> Gather more context
    |
    +-- Logs, error messages
    +-- Environment details
    +-- Recent changes
```

### 2. Isolate

```
Where does the issue occur?
|
+-- Frontend only --> Browser, component, state
+-- Backend only --> API, service, database
+-- Both --> Integration point, network
+-- Intermittent --> Race condition, timing, resources
```

### 3. Root Cause (5 Whys)

```markdown
**Problem:** API returns 500 error

1. Why? → Server threw unhandled exception
2. Why? → Database query failed
3. Why? → Connection pool exhausted
4. Why? → Connections not being released
5. Why? → Missing finally block in transaction handler

**Root Cause:** Missing cleanup in transaction handler
**Fix:** Add finally block to release connection
```

### 4. Fix and Verify

```
1. Create failing test that reproduces the bug
2. Implement the fix
3. Verify test passes
4. Check for similar issues elsewhere
5. Add regression test
```

## Debugging Commands

```bash
# Check logs
tail -f /tmp/openclaw-gateway.log

# Check process
ps aux | grep openclaw

# Check ports
lsof -i :18789

# Check network
curl -v http://localhost:18789/health

# Check database
psql -c "SELECT * FROM pg_stat_activity"
```

## Common Issues Checklist

### Application Crashes

- [ ] Memory leak (check heap usage)
- [ ] Unhandled promise rejection
- [ ] Stack overflow (recursion)
- [ ] Missing error handler

### Performance Issues

- [ ] N+1 queries
- [ ] Missing indexes
- [ ] Memory leaks
- [ ] Blocking I/O
- [ ] Large payloads

### Connection Issues

- [ ] Firewall/network
- [ ] DNS resolution
- [ ] SSL/TLS certificates
- [ ] Connection pool exhausted
- [ ] Timeout too short

### Data Issues

- [ ] Corrupt data
- [ ] Missing migrations
- [ ] Schema mismatch
- [ ] Encoding issues

## Incident Report Template

```markdown
## Incident Report: [Title]

### Summary

[Brief description]

### Timeline

| Time  | Event                 |
| ----- | --------------------- |
| HH:MM | Issue detected        |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed          |
| HH:MM | Issue resolved        |

### Impact

- Users affected: [number]
- Duration: [time]
- Severity: [P0/P1/P2/P3]

### Root Cause

[5 Whys analysis]

### Resolution

[What was done to fix]

### Prevention

[What will prevent recurrence]

### Action Items

- [ ] [Action 1] - Owner: [name]
- [ ] [Action 2] - Owner: [name]
```

## Delegation

```typescript
// Complex debugging
sessions_spawn({
  task: "Investigate why the auth service intermittently returns 503. Check logs, database connections, and recent deployments. Use 5 Whys for root cause.",
  agentId: "root-cause-analyst",
  model: "anthropic/claude-opus-4-5",
  label: "Auth 503 Investigation",
});

// Performance investigation
sessions_spawn({
  task: "Profile the orders API endpoint. It's responding in 2s+. Identify bottlenecks and recommend optimizations.",
  agentId: "performance-engineer",
  model: "anthropic/claude-sonnet-4-5",
  label: "Orders API Performance",
});
```
