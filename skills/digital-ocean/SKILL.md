---
name: digital-ocean
description: Manage Digital Ocean droplets, domains, and infrastructure via DO API.
homepage: https://docs.digitalocean.com/reference/api/
metadata: {"clawdis":{"emoji":"🌊","requires":{"bins":["uv","curl"],"env":["DO_API_TOKEN"]},"primaryEnv":"DO_API_TOKEN"}}
---

# Digital Ocean Management

Control DO droplets, domains, and infrastructure.

## Configuration

- **API Token**: `DO_API_TOKEN` environment variable
- **API Base**: `https://api.digitalocean.com/v2`

## Infrastructure Overview

### ppl.gift Droplet
- **Purpose**: Hosts Monica CRM (ppl.gift)
- **Stack**: 
  - Nginx (SSL termination, reverse proxy)
  - PHP/Laravel (Monica CRM)
  - MySQL/PostgreSQL
- **Deployment**: GitHub webhook auto-deploys on commit
- **Domain**: ppl.gift (managed via Nginx)
- **Access**: SSH key-based (can switch to root/password if needed)

## CLI Commands

```bash
# List all droplets
uv run {baseDir}/scripts/do.py droplets

# Get droplet details
uv run {baseDir}/scripts/do.py droplet <droplet_id>

# List domains
uv run {baseDir}/scripts/do.py domains

# List domain records
uv run {baseDir}/scripts/do.py records <domain>

# Droplet actions
uv run {baseDir}/scripts/do.py power-off <droplet_id>
uv run {baseDir}/scripts/do.py power-on <droplet_id>
uv run {baseDir}/scripts/do.py reboot <droplet_id>

# SSH into droplet
uv run {baseDir}/scripts/do.py ssh <droplet_id>
```

## Direct API (curl)

### List Droplets
```bash
curl -s -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/droplets" | jq '.droplets[] | {id, name, status, ip: .networks.v4[0].ip_address}'
```

### Get Account Info
```bash
curl -s -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/account" | jq '.account'
```

### List Domains
```bash
curl -s -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/domains" | jq '.domains[].name'
```

### Reboot Droplet
```bash
curl -s -X POST -H "Authorization: Bearer $DO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"reboot"}' \
  "https://api.digitalocean.com/v2/droplets/<DROPLET_ID>/actions"
```

## Notes

- Always confirm before destructive actions (power-off, destroy)
- ppl.gift auto-deploys from GitHub - manual intervention rarely needed
- For Monica updates, just push to the repo and webhook handles it
