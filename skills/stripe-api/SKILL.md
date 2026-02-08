---
name: stripe-api
description: Query Stripe payments, customers, invoices, and balances via the Stripe REST API.
homepage: https://docs.stripe.com/api
metadata:
  {
    "openclaw":
      { "emoji": "💳", "requires": { "bins": ["jq", "curl"], "env": ["STRIPE_SECRET_KEY"] } },
  }
---

# Stripe API Skill

Query and manage Stripe payments, customers, invoices, subscriptions, and balances.

## Setup

1. Go to Stripe Dashboard > Developers > API keys
2. Copy your **Secret key** (starts with `sk_live_` or `sk_test_`)
3. Set environment variable:
   ```bash
   export STRIPE_SECRET_KEY="sk_test_xxxxxxxx"
   ```

## Auth

All requests use HTTP Basic auth with the secret key as the username:

```bash
-u "$STRIPE_SECRET_KEY:"
```

## Balance

### Get current balance

```bash
curl -s "https://api.stripe.com/v1/balance" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

### List balance transactions (recent activity)

```bash
curl -s "https://api.stripe.com/v1/balance_transactions?limit=25" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, amount: (.amount/100), currency, type, created: (.created | todate)}'
```

### Balance transactions in a date range

```bash
curl -s "https://api.stripe.com/v1/balance_transactions?created[gte]=$(date -d '7 days ago' +%s)&created[lte]=$(date +%s)&limit=100" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

## Charges / Payments

### List recent payments

```bash
curl -s "https://api.stripe.com/v1/charges?limit=20" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, amount: (.amount/100), currency, status, customer, created: (.created | todate), description}'
```

### List payments by customer

```bash
curl -s "https://api.stripe.com/v1/charges?customer={customerId}&limit=20" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

## Customers

### List customers

```bash
curl -s "https://api.stripe.com/v1/customers?limit=20" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, email, name, created: (.created | todate)}'
```

### Search customers by email

```bash
curl -s -G "https://api.stripe.com/v1/customers/search" \
  --data-urlencode "query=email:'customer@example.com'" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

### Get customer details

```bash
curl -s "https://api.stripe.com/v1/customers/{customerId}" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

## Invoices

### List recent invoices

```bash
curl -s "https://api.stripe.com/v1/invoices?limit=20&status=paid" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, number, customer, amount_due: (.amount_due/100), currency, status, created: (.created | todate)}'
```

### Get invoice details with line items

```bash
curl -s "https://api.stripe.com/v1/invoices/{invoiceId}" \
  -u "$STRIPE_SECRET_KEY:" | jq '{id, number, customer_email, amount_due: (.amount_due/100), amount_paid: (.amount_paid/100), status, lines: [.lines.data[] | {description, amount: (.amount/100)}]}'
```

### List upcoming invoice for a customer

```bash
curl -s "https://api.stripe.com/v1/invoices/upcoming?customer={customerId}" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

## Subscriptions

### List active subscriptions

```bash
curl -s "https://api.stripe.com/v1/subscriptions?status=active&limit=20" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, customer, status, current_period_end: (.current_period_end | todate), items: [.items.data[] | {price: .price.id, quantity}]}'
```

## Payouts

### List recent payouts (bank transfers)

```bash
curl -s "https://api.stripe.com/v1/payouts?limit=10" \
  -u "$STRIPE_SECRET_KEY:" | jq '.data[] | {id, amount: (.amount/100), currency, status, arrival_date: (.arrival_date | todate)}'
```

## Reporting

### Revenue summary (last 30 days)

Combine balance transactions to calculate totals:

```bash
curl -s "https://api.stripe.com/v1/balance_transactions?created[gte]=$(date -d '30 days ago' +%s)&limit=100&type=charge" \
  -u "$STRIPE_SECRET_KEY:" | jq '[.data[].amount] | add / 100'
```

### Refunds in period

```bash
curl -s "https://api.stripe.com/v1/refunds?created[gte]=$(date -d '30 days ago' +%s)&limit=100" \
  -u "$STRIPE_SECRET_KEY:" | jq
```

## Notes

- All monetary amounts are in **cents** (divide by 100 for display)
- Timestamps are Unix epoch seconds (use `| todate` in jq to format)
- Rate limit: 100 read requests per second in live mode, 25 in test mode
- Use `?limit=` (max 100) and `?starting_after={lastId}` for pagination
- Date filters: `created[gte]`, `created[lte]`, `created[gt]`, `created[lt]` (Unix timestamps)
- Use test mode keys (`sk_test_`) for development; live keys (`sk_live_`) for production
- On macOS, use `date -v-7d +%s` instead of `date -d '7 days ago' +%s`
