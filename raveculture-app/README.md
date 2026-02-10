# baseFM / RaveCulture

## Overview

baseFM is a Base-native onchain media and commerce platform built under the RaveCulture brand. It focuses on underground electronic music, live streams, events, and drops — using onchain infrastructure to enable access, ownership, and commerce without compromising UX.

**This is a production-grade product, not a demo or experimental Web3 app.**

## Product Philosophy

- Brand-first UX, not wallet-first
- Crypto as infrastructure, not the product
- Base / Coinbase ecosystem alignment
- Stability over experimental APIs
- Clean wallet behavior with zero remounts

Users should feel like they are interacting with a cultural platform — not a crypto dashboard.

## Core Use Cases

- Token-gated event access
- Token-gated live streams
- Exclusive drops (digital + physical)
- Onchain identity for culture participants
- Integrated commerce via Shopify + Base

## Tech Stack

### Frontend
- Next.js 14.2.x (App Router)
- React 19
- TypeScript 5.3.x
- Tailwind CSS v4

### Onchain
- @coinbase/onchainkit 1.1.2
- wagmi v2
- viem v2
- ethers v6 (no provider imports in Next runtime)

### Platform
- Base (primary and only chain)
- Farcaster Miniapp compatible

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your keys in .env.local

# Run development server
npm run dev
```

## Environment Variables

See `.env.example` for all required variables. Key notes:
- `BANKR_PRIVATE_KEY` is **server-only** — never expose client-side
- `NEXT_PUBLIC_*` vars are safe for client bundles
- Deploy with Vercel environment variables in production

## Architecture

```
User → Frontend (Next.js App Router)
         ├─ OnchainKit wallet connect
         ├─ Token-gated UI
         ├─ Mint button → POST /api/bankr-mint
         ↓
       /api/bankr-mint (server-only)
         ├─ BankrClient (@bankr/sdk)
         ├─ Private key signing
         ├─ Base network
         ↓
       Base chain → NFT minted → Clanker chat unlocks
```

## Commerce

- Shopify for inventory, fulfillment, tax
- OnchainKit for wallet-aware UX
- Base for ownership, gating, and drops

Design references:
- https://shop.base.org
- Base onchain commerce template

## What This Project Avoids

- ❌ Multichain complexity
- ❌ Deprecated wallet patterns
- ❌ Wallet-first UX
- ❌ Experimental or unstable APIs
- ❌ "Connect wallet to see anything" flows

## Status

- ✅ Architecture locked
- ✅ Stack stabilized
- ✅ Design direction validated
- ✅ Minting paths evaluated (Base-only)
- ✅ Commerce direction chosen (Shopify + Base)

## Domains

- **RaveCulture** → raveculture.xyz
- **baseFM** → basefm.space
- **Shop** → shop.basefm.space
