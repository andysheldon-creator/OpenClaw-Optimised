---
name: godaddy
description: Search and purchase domains via GoDaddy API, auto-configure Vercel nameservers.
---

# GoDaddy Domains

Search, purchase, and manage domains via GoDaddy API. Automatically points nameservers to Vercel after purchase.

## Setup
- **GODADDY_KEY**: API key
- **GODADDY_SECRET**: API secret
- **Environment**: Production (OTE for testing)

## Commands

```bash
godaddy.py search <domain>      # Check availability + price
godaddy.py buy <domain>         # Purchase and set Vercel NS
godaddy.py list                 # List owned domains
godaddy.py ns <domain>          # Check/update nameservers
```

## Workflow

1. `godaddy.py search example.com` — Check if available + price
2. `godaddy.py buy example.com` — Purchase domain
3. Automatically sets nameservers to Vercel:
   - ns1.vercel-dns.com
   - ns2.vercel-dns.com
4. Add domain to Vercel project as needed

## API Reference

Base URL: `https://api.godaddy.com` (prod) or `https://api.ote-godaddy.com` (test)

### Check Availability
```bash
curl -s "https://api.godaddy.com/v1/domains/available?domain=example.com" \
  -H "Authorization: sso-key $KEY:$SECRET"
```

### Purchase Domain
```bash
curl -s -X POST "https://api.godaddy.com/v1/domains/purchase" \
  -H "Authorization: sso-key $KEY:$SECRET" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", ...}'
```

### Update Nameservers
```bash
curl -s -X PUT "https://api.godaddy.com/v1/domains/example.com/records/NS" \
  -H "Authorization: sso-key $KEY:$SECRET" \
  -d '[{"data": "ns1.vercel-dns.com", ...}]'
```
