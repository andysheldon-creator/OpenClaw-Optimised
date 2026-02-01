# PROJECT CHARTER: SHARPS-EDGE

## Objective

Build and deploy a production x402 micropayment API that sells AI-powered sports betting intelligence.

**Success = First x402 payment received**

## Scope IN

- Cloudflare Workers deployment
- Hono API framework
- x402 payment integration (Coinbase x402 protocol)
- API Endpoints:
  - `GET /health` - Health check
  - `GET /sports` - Available sports listing
  - `GET /quick-check` - Fast odds summary (low-cost)
  - `GET /line-check` - Line movement analysis (mid-cost)
  - `GET /full-analysis` - Complete multi-model consensus analysis (premium)
- Data integration: The Odds API, ESPN public endpoints, Open-Meteo weather
- Analysis engine with multi-model consensus
- Caching layer for API call efficiency
- Error handling and graceful degradation

## Scope OUT

- User accounts / authentication (x402 handles payment identity)
- Mobile app
- Marketing content (separate project)
- Canon truth system (separate project)
- Paid APIs until revenue supports the cost
- Frontend / UI (API-only)
- Real-time streaming / WebSockets

## Guardrails

1. Stay within free tiers for all external APIs
2. Cache aggressively - The Odds API allows 500 calls/month on free tier
3. Never guarantee outcomes - all analysis includes disclaimers
4. Track all costs - every API call and LLM invocation logged
5. Test with small amounts before any real money flows
6. No storing of user data beyond what x402 requires

## Technical Stack

- Runtime: Cloudflare Workers
- Framework: Hono
- Payment: x402 micropayment protocol
- Data: The Odds API, ESPN, Open-Meteo
- Analysis: Multi-model LLM consensus
- Cache: Cloudflare KV or Workers Cache API

## Success Criteria

- [ ] API deployed to Cloudflare Workers
- [ ] All 5 endpoints functional
- [ ] x402 payment flow working end-to-end
- [ ] First payment received
- [ ] $200/month revenue (breakeven)

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API free tier exceeded | Medium | High (no data) | Aggressive caching, quota monitoring |
| x402 integration issues | Medium | High (no revenue) | Test early, use testnet first |
| LLM costs exceed budget | Low | Medium | Track per-call, set hard limits |
| Sports data quality | Low | Medium | Multi-source validation |
