# Domain Recipe: Polymarket Intelligence

Domain-specific knowledge for building prediction market intelligence services on OpenServ. This file documents everything an AI coding agent needs to know about Polymarket, Dome API, and Gamma API that isn't in any official documentation.

Use this recipe when the user mentions: Polymarket, prediction markets, Dome API, wallet tracking, smart money, or market intelligence.

---

## The Product Pattern

**Input:** A Polymarket market URL (e.g., `https://polymarket.com/event/something/will-x-happen`)
**Output:** What historically profitable wallets think about this market - direction, conviction, consensus.
**Price:** $1.00-2.00 (replaces 30-60 minutes of manual multi-tab research)
**Why it works:** The data chain requires 20+ API calls with non-trivial logic. Nobody packages this as a single query.

---

## The Wallet Discovery Trick (this is the entire product)

There is NO leaderboard endpoint. No "top wallets" API. Wallet discovery works through a specific chain:

1. **Start from the market, not from wallets.** Query Dome Trade History BY TOKEN ID to get every wallet that traded this specific market.
2. **Filter to significant wallets.** Keep only wallets with > $1000 volume on this market.
3. **Check career PnL.** For each significant wallet, call Dome Wallet PnL. This returns CAREER-WIDE realized + unrealized profit across ALL markets - not per-market PnL. Keep only wallets with positive realized PnL.
4. **Check current positions.** For each profitable wallet, call Dome Positions. Find their position on THIS specific market - direction (YES/NO), size, entry price.
5. **Calculate consensus.** What percentage of profitable wallets agree on direction? Weight by career PnL (a $1M wallet's opinion counts more than a $10K wallet's).

```typescript
// Step 1: Discover wallets from market activity
const trades = await dome.polymarket.trades.getTradeHistory({
  token_id: marketTokenId,  // NOT wallet address - token_id!
  limit: 200
})

// Step 2: Extract unique wallets with significant volume
const walletVolumes = new Map<string, number>()
for (const trade of trades) {
  const addr = trade.makerAddress || trade.takerAddress
  if (addr) walletVolumes.set(addr, (walletVolumes.get(addr) || 0) + (trade.size || 0))
}
const significantWallets = [...walletVolumes.entries()]
  .filter(([_, vol]) => vol > 1000)
  .map(([addr]) => addr)

// Step 3: Check career PnL (cap at 20 for rate limits, cache for 30 min)
for (const addr of significantWallets.slice(0, 20)) {
  const pnl = await dome.polymarket.wallets.getWalletPnl({ address: addr })
  if (pnl.realizedPnl > 0) {
    // Step 4: This is smart money - check their position on THIS market
    const positions = await dome.polymarket.wallets.getPositions({ address: addr })
    const thisPosition = positions?.find(p => p.tokenId === marketTokenId)
    // Record: address, careerPnl, direction, positionSize
  }
}
```

---

## Polymarket URL Anatomy

Users paste URLs in multiple formats. The resolver must handle all of them:

| Format | Example | How to resolve |
|--------|---------|---------------|
| Event URL | `polymarket.com/event/slug-name` | Contains MULTIPLE sub-markets. Must pick one (highest volume). |
| Market URL | `polymarket.com/event/slug/specific-question` | Single market. Extract slug from path. |
| Event ID | `event_id=abc123` | Direct Gamma API lookup. |
| Just a question | "Will X happen?" | Search Gamma API by text. |

**Event URLs are the tricky case.** An event like "US Election" contains dozens of sub-markets (president, senate races, etc.). The resolver must:

1. Extract the slug from the URL path
2. Hit Gamma API: `GET https://gamma-api.polymarket.com/events?slug={slug}`
3. Response contains `markets[]` array - each is a separate prediction market
4. Pick the highest-volume market (or let the user specify)

---

## Gamma API (Polymarket's metadata API)

Base URL: `https://gamma-api.polymarket.com`

| Endpoint | Returns | Key fields |
|----------|---------|-----------|
| `GET /events?slug={slug}` | Event with markets array | `markets[].clobTokenIds`, `markets[].question`, `markets[].outcomePrices`, `markets[].volume24hr` |
| `GET /markets?id={id}` | Single market | Same fields as above |

**CRITICAL PARSING GOTCHA:** `clobTokenIds` is a **JSON STRING**, not an array. You must `JSON.parse()` it:

```typescript
const event = await fetchGammaEvent(slug)
const market = event.markets[0] // or highest volume

// WRONG: market.clobTokenIds[0]
// RIGHT:
const tokenIds = JSON.parse(market.clobTokenIds) // ["token_id_yes", "token_id_no"]
const yesTokenId = tokenIds[0]
const noTokenId = tokenIds[1]
```

`outcomePrices` is also a JSON string: `JSON.parse(market.outcomePrices)` returns `["0.62", "0.38"]` (YES price, NO price).

---

## Dome API (@dome-api/sdk)

Base URL: `https://api.domeapi.io/v1`
SDK: `npm install @dome-api/sdk`
Rate limits: Free tier 10 QPS, 100 per 10 seconds. Implement backoff. Hits at ~50 rapid calls.

### Polymarket Endpoints

| Method | What it actually returns | Gotchas |
|--------|------------------------|---------|
| `polymarket.trades.getTradeHistory({ token_id, limit })` | Individual fills with wallet addresses | This is the wallet discovery entry point. Query by `token_id`, NOT by wallet. |
| `polymarket.wallets.getWalletPnl({ address })` | Career-wide realized + unrealized PnL | NOT per-market PnL. This is total across ALL markets the wallet has ever traded. |
| `polymarket.wallets.getPositions({ address })` | Current open positions | Returns array with tokenId, side (YES/NO), size, avgEntryPrice. |
| `polymarket.markets.getMarketPrice({ token_id })` | Current price | Returns `{ price: number }` for a single token. |
| `polymarket.markets.getCandlesticks({ token_id, interval })` | OHLCV candles | Useful for spread dynamics if doing cross-platform comparison. |
| `polymarket.wallets.getActivity({ address })` | MERGES, SPLITS, REDEEMS | Position lifecycle events. Less useful for intelligence, more for P&L reconciliation. |

### Kalshi Endpoints (for cross-platform comparison)

| Method | Returns |
|--------|---------|
| `kalshi.markets.getMarketPrice({ market_id })` | Current Kalshi price for the same event |
| `kalshi.markets.getMarkets({ search })` | Kalshi market metadata |

### Matching Markets (cross-platform arbitrage)

```
GET /matching-markets/sports
GET /matching-markets/sports/{sport}?date=YYYY-MM-DD
```

Returns events listed on BOTH Polymarket and Kalshi with normalized identifiers. Only covers sports markets - not politics, crypto, culture. Useful as a bonus signal, not the core product.

### Dome SDK Initialization

```typescript
import { DomeClient } from '@dome-api/sdk'
const dome = new DomeClient({ apiKey: process.env.DOME_API_KEY! })
```

Get API key at `dashboard.domeapi.io`. Free tier is sufficient for development and moderate production load.

**Note:** Dome was acquired by Polymarket (Feb 2026). API still operational. Monitor for endpoint changes.

---

## Caching Strategy

| Data | Cache TTL | Rationale |
|------|-----------|-----------|
| Wallet PnL | 30 minutes | Career PnL changes slowly |
| Wallet positions | 5 minutes | Positions can change with trades |
| Market price | 60 seconds | Prices move but not millisecond-critical for intelligence |
| Trade history | No cache | Always want fresh for wallet discovery |
| Gamma event/market metadata | 10 minutes | Market structure rarely changes |

---

## Scoring Formula

Composite score 0-100 for each market opportunity:

| Component | Max points | What it measures |
|-----------|-----------|-----------------|
| Smart money count | 30 | Number of historically profitable wallets active in this market. Each profitable wallet adds 10 points, max 30. Weight by career PnL (a $1M wallet counts more). |
| Consensus direction | 20 | Agreement among profitable wallets. 100% agreement = 20. 50/50 split = 0. Formula: `(pctMajority - 0.5) * 2 * 20` |
| Conviction size | 20 | Average position size of profitable wallets relative to market volume. Larger positions = higher conviction. |
| Research alignment | 20 | Web/social research sentiment alignment with smart money direction. Requires Exa or similar search. |
| Cross-platform edge | 10 | If the event exists on Kalshi via Dome Matching Markets, price spread adds confirmation. No Kalshi match = 5 (neutral). |

Classification:
- >= 75: STRONG
- >= 55: MODERATE
- >= 35: WEAK
- < 35: NOISE

---

## Empty Data Handling

Most low-volume markets return zero profitable wallets. The agents MUST degrade gracefully:

```typescript
// If zero trades found on this market
if (trades.length === 0) {
  return {
    tldr: 'No trading activity found on this market. Insufficient data for smart money analysis.',
    signal: { direction: 'UNKNOWN', confidence: 0, classification: 'NOISE' },
    wallets_analyzed: 0,
    methodology: { reason: 'zero_trades' }
  }
}

// If zero profitable wallets found
if (profitableWallets.length === 0) {
  return {
    tldr: `Found ${significantWallets.length} active wallets but none with positive career PnL. No smart money signal available.`,
    signal: { direction: 'UNKNOWN', confidence: 5, classification: 'NOISE' },
    wallets_analyzed: significantWallets.length,
    methodology: { reason: 'no_profitable_wallets' }
  }
}
```

**CRITICAL:** When data is empty, skip `generate()` entirely. Build the response in code. The LLM adds nothing when there's nothing to synthesize, and you save 30-60 seconds of platform overhead.

---

## Output Specification

```typescript
interface PolySignalOutput {
  tldr: string  // "3 historically profitable wallets (combined +$450K career PnL) are 
                //  all long YES at avg $0.42. Consensus: 100% YES. Confidence: 78/100 STRONG."
  signal: {
    direction: 'YES' | 'NO' | 'SPLIT' | 'UNKNOWN'
    confidence: number        // 0-100
    classification: 'STRONG' | 'MODERATE' | 'WEAK' | 'NOISE'
    current_price: { yes: number; no: number }
  }
  smart_money: {
    wallets_found: number     // total significant wallets
    profitable_wallets: number // wallets with positive career PnL
    total_career_pnl: number  // combined career PnL of profitable wallets
    consensus_pct: number     // 0-1, percentage agreeing on majority direction
    top_wallets: Array<{
      address: string         // truncated: 0x1a2b...3c4d
      career_pnl: number
      position_direction: 'YES' | 'NO' | null
      position_size: number
    }>
  }
  market: {
    question: string
    current_yes_price: number
    current_no_price: number
    volume_24h: number
    event_title: string
  }
  research?: {                // populated by web search agent
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED'
    key_findings: string[]
    sources_checked: number
  }
  methodology: {
    wallets_scanned: number
    profitable_filtered: number
    scoring_weights: string
    data_freshness: string    // ISO timestamp
  }
}
```

The `tldr` field is the product. It must be specific enough to act on without reading the rest. Never generic. "3 profitable wallets all long YES at $0.42" not "there are bullish and bearish signals."

---

## Agent Architecture for PolySignal

```
x402 ($1.00) + webhook (free, for testing)
  |
  v
Resolver (gpt-5-mini)
  - Takes URL/slug/question
  - Resolves via Gamma API to token_ids + market metadata
  - Handles event vs market URL distinction
  - Outputs: { token_ids, question, prices, volume, event_title }
  |
  ├──> Intelligence (gpt-5)
  |     - Runs wallet discovery chain (trade history → PnL filter → position check)
  |     - Computes smart money consensus and conviction
  |     - Outputs: { wallets_scanned, profitable_wallets, consensus, top_wallets[] }
  |
  ├──> Research (gpt-5)
  |     - Web search via Exa for recent news/sentiment on the event
  |     - Social media sentiment check
  |     - Outputs: { sentiment, key_findings[], sources_checked }
  |
  └──> (both feed into)
       Compiler (claude-opus-4-6)
         - Synthesizes intelligence + research into scored signal
         - Generates tldr field
         - Outputs: complete PolySignalOutput JSON

Edge topology:
  trigger:x402  -> task:resolver
  trigger:test  -> task:resolver
  task:resolver -> task:intelligence  (fan-out)
  task:resolver -> task:research      (fan-out)
  task:research -> task:compiler      (fan-in: ONE edge from slower task)
  // compiler fetches intelligence data via get-task-detail
```

---

## Exa API for Research Agent

Use Exa (exa.ai) for web search. Direct HTTP calls, not MCP (MCP may not work in deployed containers).

```typescript
const EXA_API_KEY = process.env.EXA_API_KEY
const response = await fetch('https://api.exa.ai/search', {
  method: 'POST',
  headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `${market.question} prediction analysis`,
    numResults: 3,
    type: 'neural',
    contents: { text: { maxCharacters: 500 } }
  })
})
```

Keep searches minimal: 2 queries max, 3 results each, 500 chars per result. Each search adds latency.
