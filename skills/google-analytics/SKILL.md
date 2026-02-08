---
name: google-analytics
description: Query Google Analytics 4 property data (sessions, pageviews, conversions, traffic sources) via the GA4 Data API.
homepage: https://developers.google.com/analytics/devguides/reporting/data/v1
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "requires":
          { "bins": ["jq", "curl"], "env": ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_KEY"] },
      },
  }
---

# Google Analytics 4 Skill

Query website analytics data from Google Analytics 4 properties.

## Setup

1. Create a Google Cloud service account with GA4 access:
   - Go to Google Cloud Console > IAM & Admin > Service Accounts
   - Create a service account and download the JSON key file
   - In GA4 Admin > Property Access Management, add the service account email as a Viewer

2. Set environment variables:
   ```bash
   export GA4_PROPERTY_ID="123456789"                           # your GA4 property ID
   export GOOGLE_SERVICE_ACCOUNT_KEY="/path/to/service-account.json"  # path to key file
   ```

## Auth

GA4 Data API uses OAuth 2.0 with a service account. Get a bearer token first:

```bash
# Generate access token from service account key
GA4_TOKEN=$(python3 -c "
import json, time, jwt, requests
key = json.load(open('$GOOGLE_SERVICE_ACCOUNT_KEY'))
now = int(time.time())
payload = {'iss': key['client_email'], 'scope': 'https://www.googleapis.com/auth/analytics.readonly', 'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3600}
signed = jwt.encode(payload, key['private_key'], algorithm='RS256')
r = requests.post('https://oauth2.googleapis.com/token', data={'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': signed})
print(r.json()['access_token'])
")
```

If `PyJWT` and `requests` are not available, use `gcloud` instead:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$GOOGLE_SERVICE_ACCOUNT_KEY"
GA4_TOKEN=$(gcloud auth application-default print-access-token)
```

## Reports

All report requests are POST to:

```
https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport
```

### Sessions and pageviews (last 7 days)

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    "metrics": [
      {"name": "sessions"},
      {"name": "screenPageViews"},
      {"name": "activeUsers"},
      {"name": "bounceRate"},
      {"name": "averageSessionDuration"}
    ]
  }' | jq '.rows[0].metricValues | map(.value)'
```

### Daily sessions breakdown (last 30 days)

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "date"}],
    "metrics": [{"name": "sessions"}, {"name": "activeUsers"}],
    "orderBys": [{"dimension": {"dimensionName": "date"}}]
  }' | jq '.rows[] | {date: .dimensionValues[0].value, sessions: .metricValues[0].value, users: .metricValues[1].value}'
```

### Top pages by pageviews

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "pagePath"}],
    "metrics": [{"name": "screenPageViews"}, {"name": "activeUsers"}, {"name": "bounceRate"}],
    "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": true}],
    "limit": 20
  }' | jq '.rows[] | {page: .dimensionValues[0].value, views: .metricValues[0].value, users: .metricValues[1].value, bounce: .metricValues[2].value}'
```

### Traffic sources

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "sessionSource"}, {"name": "sessionMedium"}],
    "metrics": [{"name": "sessions"}, {"name": "activeUsers"}, {"name": "conversions"}],
    "orderBys": [{"metric": {"metricName": "sessions"}, "desc": true}],
    "limit": 15
  }' | jq '.rows[] | {source: .dimensionValues[0].value, medium: .dimensionValues[1].value, sessions: .metricValues[0].value}'
```

### Conversions by event

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "eventName"}],
    "metrics": [{"name": "eventCount"}, {"name": "conversions"}],
    "dimensionFilter": {"filter": {"fieldName": "eventName", "stringFilter": {"matchType": "CONTAINS", "value": "purchase"}}},
    "limit": 10
  }' | jq
```

### Week-over-week comparison

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [
      {"startDate": "7daysAgo", "endDate": "today", "name": "this_week"},
      {"startDate": "14daysAgo", "endDate": "8daysAgo", "name": "last_week"}
    ],
    "metrics": [{"name": "sessions"}, {"name": "activeUsers"}, {"name": "screenPageViews"}, {"name": "conversions"}]
  }' | jq
```

### Device and browser breakdown

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "deviceCategory"}],
    "metrics": [{"name": "sessions"}, {"name": "activeUsers"}, {"name": "bounceRate"}]
  }' | jq '.rows[] | {device: .dimensionValues[0].value, sessions: .metricValues[0].value}'
```

### Geographic breakdown

```bash
curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $GA4_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    "dimensions": [{"name": "country"}],
    "metrics": [{"name": "sessions"}, {"name": "activeUsers"}],
    "orderBys": [{"metric": {"metricName": "sessions"}, "desc": true}],
    "limit": 10
  }' | jq '.rows[] | {country: .dimensionValues[0].value, sessions: .metricValues[0].value}'
```

## Notes

- Property ID is numeric (not the Measurement ID starting with G-)
- Date formats: `YYYY-MM-DD`, `today`, `yesterday`, `NdaysAgo`
- Common dimensions: `date`, `pagePath`, `pageTitle`, `sessionSource`, `sessionMedium`, `country`, `city`, `deviceCategory`, `browser`, `eventName`, `landingPage`
- Common metrics: `sessions`, `activeUsers`, `screenPageViews`, `bounceRate`, `averageSessionDuration`, `conversions`, `eventCount`, `totalRevenue`
- API quota: 10,000 requests per day per property
- Token expires after 1 hour; regenerate as needed
