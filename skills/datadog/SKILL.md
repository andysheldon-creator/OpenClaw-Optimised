---
name: datadog
description: Query Datadog metrics, monitors, events, and logs via the Datadog REST API.
homepage: https://docs.datadoghq.com/api/
metadata:
  {
    "openclaw":
      {
        "emoji": "🐶",
        "requires": { "bins": ["jq", "curl"], "env": ["DD_API_KEY", "DD_APP_KEY", "DD_SITE"] },
      },
  }
---

# Datadog Skill

Query infrastructure metrics, monitors, events, and logs from Datadog.

## Setup

1. Go to Datadog > Organization Settings > API Keys — create/copy an API key
2. Go to Organization Settings > Application Keys — create an app key
3. Set environment variables:
   ```bash
   export DD_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   export DD_APP_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   export DD_SITE="datadoghq.com"   # or datadoghq.eu, us3.datadoghq.com, etc.
   ```

## Auth

All requests use header-based auth:

```bash
-H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY"
```

Base URL: `https://api.$DD_SITE/api`

## Metrics

### Query a metric (last hour)

```bash
curl -s -G "https://api.$DD_SITE/api/v1/query" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  --data-urlencode "query=avg:system.cpu.user{*}" \
  -d "from=$(( $(date +%s) - 3600 ))" \
  -d "to=$(date +%s)" | jq '.series[0].pointlist | map({time: (.[0]/1000 | todate), value: .[1]})'
```

### Query with host/tag filters

```bash
curl -s -G "https://api.$DD_SITE/api/v1/query" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  --data-urlencode "query=avg:system.mem.used{env:production,service:api-gateway} by {host}" \
  -d "from=$(( $(date +%s) - 3600 ))" \
  -d "to=$(date +%s)" | jq '.series[] | {host: .scope, avg: (.pointlist | map(.[1]) | add / length)}'
```

### Common metrics

- CPU: `system.cpu.user`, `system.cpu.system`, `system.cpu.idle`
- Memory: `system.mem.used`, `system.mem.free`, `system.mem.pct_usable`
- Disk: `system.disk.used`, `system.disk.free`, `system.disk.in_use`
- Network: `system.net.bytes_rcvd`, `system.net.bytes_sent`
- Load: `system.load.1`, `system.load.5`, `system.load.15`
- Docker: `docker.cpu.usage`, `docker.mem.rss`
- APM: `trace.http.request.duration`, `trace.http.request.errors`

## Monitors

### List all monitors

```bash
curl -s "https://api.$DD_SITE/api/v1/monitor" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '.[] | {id, name, type, overall_state}'
```

### List monitors in alert state

```bash
curl -s "https://api.$DD_SITE/api/v1/monitor?monitor_tags=*&with_downtimes=true" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '[.[] | select(.overall_state == "Alert" or .overall_state == "Warn")] | .[] | {id, name, state: .overall_state, message}'
```

### Get a specific monitor

```bash
curl -s "https://api.$DD_SITE/api/v1/monitor/{monitorId}" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '{id, name, type, query, overall_state, message, tags}'
```

### Monitor status summary

```bash
curl -s "https://api.$DD_SITE/api/v1/monitor/groups" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '.counts'
```

## Events

### List recent events

```bash
curl -s -G "https://api.$DD_SITE/api/v1/events" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -d "start=$(( $(date +%s) - 86400 ))" \
  -d "end=$(date +%s)" | jq '.events[] | {id, title, date_happened: (.date_happened | todate), priority, source, tags}'
```

### Search events by source

```bash
curl -s -G "https://api.$DD_SITE/api/v1/events" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  --data-urlencode "sources=github,pagerduty" \
  -d "start=$(( $(date +%s) - 86400 ))" \
  -d "end=$(date +%s)" | jq '.events[] | {title, source, date_happened: (.date_happened | todate)}'
```

## Logs

### Search logs (last hour)

```bash
curl -s -X POST "https://api.$DD_SITE/api/v2/logs/events/search" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "query": "service:api-gateway status:error",
      "from": "now-1h",
      "to": "now"
    },
    "sort": "-timestamp",
    "page": {"limit": 25}
  }' | jq '.data[] | {timestamp: .attributes.timestamp, message: .attributes.message, service: .attributes.service, status: .attributes.status}'
```

### Count logs by status

```bash
curl -s -X POST "https://api.$DD_SITE/api/v2/logs/analytics/aggregate" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"query": "*", "from": "now-1h", "to": "now"},
    "compute": [{"aggregation": "count"}],
    "group_by": [{"facet": "status"}]
  }' | jq '.data.buckets'
```

## Hosts

### List hosts

```bash
curl -s "https://api.$DD_SITE/api/v1/hosts?count=25&sort_field=cpu&sort_dir=desc" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '.host_list[] | {name, apps, tags_by_source, up: .is_muted | not}'
```

## SLOs

### List SLOs

```bash
curl -s "https://api.$DD_SITE/api/v1/slo" \
  -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '.data[] | {id, name, type, target: .thresholds[0].target, status: .overall_status}'
```

## Notes

- All timestamps are Unix epoch seconds
- Metric query syntax: `aggregation:metric.name{tag:value} by {group}`
- Aggregations: avg, sum, min, max, count
- Time windows in queries: use `from`/`to` as Unix seconds, or `now-1h`, `now-1d` in log queries
- Rate limit: 300 requests per hour for free plan, higher for paid
- DD_SITE values: `datadoghq.com` (US1), `datadoghq.eu` (EU), `us3.datadoghq.com` (US3), `us5.datadoghq.com` (US5)
- Monitor states: OK, Alert, Warn, No Data, Unknown, Skipped
