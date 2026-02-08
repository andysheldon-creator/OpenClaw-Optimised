---
name: hubspot
description: Manage HubSpot CRM contacts, companies, deals, and activities via the HubSpot REST API.
homepage: https://developers.hubspot.com/docs/api/overview
metadata:
  {
    "openclaw":
      { "emoji": "🧲", "requires": { "bins": ["jq", "curl"], "env": ["HUBSPOT_ACCESS_TOKEN"] } },
  }
---

# HubSpot CRM Skill

Manage contacts, companies, deals, and activities in HubSpot via the REST API.

## Setup

1. Go to HubSpot > Settings > Integrations > Private Apps
2. Create a private app with scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.deals.write`
3. Copy the access token
4. Set environment variable:
   ```bash
   export HUBSPOT_ACCESS_TOKEN="pat-na1-xxxxxxxx"
   ```

## Auth

All requests use Bearer token auth:

```bash
-H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" -H "Content-Type: application/json"
```

## Contacts

### Search contacts

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filterGroups":[{"filters":[{"propertyName":"email","operator":"CONTAINS_TOKEN","value":"*@example.com"}]}],"properties":["email","firstname","lastname","phone","company"],"limit":10}' | jq
```

### Get a contact by ID

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/contacts/{contactId}?properties=email,firstname,lastname,phone,company,lifecyclestage,hs_lead_status" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

### Create a contact

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"email":"lead@example.com","firstname":"Jane","lastname":"Doe","phone":"+1234567890","company":"Acme Corp","lifecyclestage":"lead"}}' | jq
```

### Update a contact

```bash
curl -s -X PATCH "https://api.hubapi.com/crm/v3/objects/contacts/{contactId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"hs_lead_status":"QUALIFIED","lifecyclestage":"marketingqualifiedlead"}}' | jq
```

### List recent contacts

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=email,firstname,lastname,company,createdate,hs_lead_status&sorts=-createdate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

## Companies

### Search companies

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/companies/search" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filterGroups":[{"filters":[{"propertyName":"name","operator":"CONTAINS_TOKEN","value":"acme"}]}],"properties":["name","domain","industry","numberofemployees","annualrevenue"],"limit":10}' | jq
```

### Get a company

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/companies/{companyId}?properties=name,domain,industry,numberofemployees,annualrevenue,city,state,country" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

## Deals

### List deals in a pipeline

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/deals?limit=20&properties=dealname,amount,dealstage,closedate,pipeline&sorts=-createdate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

### Create a deal

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/deals" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"dealname":"Acme Corp - Enterprise","amount":"50000","dealstage":"appointmentscheduled","pipeline":"default","closedate":"2026-03-15"}}' | jq
```

### Associate a deal with a contact

```bash
curl -s -X PUT "https://api.hubapi.com/crm/v3/objects/deals/{dealId}/associations/contacts/{contactId}/deal_to_contact" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

## Activities

### Log a note on a contact

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/notes" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"hs_note_body":"Call notes: Discussed pricing. Follow up next week.","hs_timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}}' | jq
```

Then associate the note with a contact:

```bash
curl -s -X PUT "https://api.hubapi.com/crm/v3/objects/notes/{noteId}/associations/contacts/{contactId}/note_to_contact" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq
```

### Log an email activity

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/emails" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties":{"hs_email_subject":"Follow-up: Pricing Discussion","hs_email_text":"Hi Jane, following up on our call...","hs_email_direction":"SENT_BY_AGENT","hs_timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}}' | jq
```

## Notes

- Rate limits: 100 requests per 10 seconds for private apps
- All timestamps are ISO-8601 UTC
- Use `limit` and `after` for pagination (response includes `paging.next.after`)
- Properties must be explicitly requested via `?properties=` or in search body
- Lifecycle stages: subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer, evangelist
- Lead statuses: NEW, OPEN, IN_PROGRESS, OPEN_DEAL, UNQUALIFIED, ATTEMPTED_TO_CONTACT, CONNECTED, BAD_TIMING
