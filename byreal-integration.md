# Mantis × Byreal Integration Plan

> V2.0 — 2026-06-13
>
> Primary concern: **Real money is involved.** Every section has safety rails.
> Demo capital: **$10-20 total** — small enough to lose, big enough to show it works.

---

## 1. Architecture

### 1.1 Three surfaces, two chains

```
                          ┌──────────────────────────┐
                          │     User                  │
                          └──────┬─────────┬──────────┘
                                 │         │
                      Telegram   │         │  Web Dashboard
                                 ▼         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Byreal's Servers                         │
    │  ┌──────────────────────────────────────────────────────┐   │
    │  │  RealClaw (hosted OpenClaw + Claude LLM)             │   │
    │  │  - Privy wallet: 0x5a6c...9aad                       │   │
    │  │  - Built-in Byreal skill (Perps + Solana)            │   │
    │  │  - Mantis skill (custom SKILL.md → our API)          │   │
    │  │  - Telegram bot: MantisPincerBot                     │   │
    │  └──────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────┘
                                 │
               ┌─────────────────┤
               │                 │
               ▼                 ▼
          Solana          Hyperliquid
          mainnet         mainnet

    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

    ┌──────────────────────────────────────────────────────────────┐
    │               Our VPS (Hetzner CX23, €4.49/mo)               │
    │                                                              │
    │  ┌────────────────────────────────────────────────────────┐  │
    │  │  Mantis Web App (Next.js)                              │  │
    │  │  - Web dashboard + chat UI                             │  │
    │  │  - DeepSeek LLM with tool calling                      │  │
    │  │  ┌──────────────────────────────────────────────────┐  │  │
    │  │  │  Tools (14)                                       │  │  │
    │  │  │                                                   │  │  │
    │  │  │  Byreal/Perps:  byreal-perps-cli -o json          │  │  │
    │  │  │    account info, market/limit orders, TP/SL,      │  │  │
    │  │  │    positions, signal scan, cancel all             │  │  │
    │  │  │                                                   │  │  │
    │  │  │  Mantle/DeFi:  viem + contracts                   │  │  │
    │  │  │    swaps (Merchant Moe), lending (Lendle),         │  │  │
    │  │  │    vault (AgentVault), audit (ERC-8004)           │  │  │
    │  │  └──────────────────────────────────────────────────┘  │  │
    │  └────────────────────────────────────────────────────────┘  │
    │                                                              │
    │  ┌────────────────────────────────────────────────────────┐  │
    │  │  Autonomous Agent Loop (background worker)             │  │
    │  │  - Sentiment polling (CoinGecko + Fear & Greed + news) │  │
    │  │  - DeepSeek evaluates trade signals                    │  │
    │  │  - Executes via byreal-perps-cli                       │  │
    │  │  - Journals every decision on Mantle (ERC-8004 + IPFS) │  │
    │  └────────────────────────────────────────────────────────┘  │
    │                                                              │
    │  ┌────────────────────────────────────────────────────────┐  │
    │  │  Self-hosted OpenClaw (optional — test first)          │  │
    │  │  - Loads Mantis skill from ~/.openclaw/workspace        │  │
    │  │  - Connects to TG if RealClaw skill loading fails       │  │
    │  │  - Runs as daemon, listens on localhost:18789          │  │
    │  └────────────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────────────┘
                                 │
               ┌─────────────────┤
               │                 │
               ▼                 ▼
          Mantle           Hyperliquid
          mainnet          mainnet
```

### 1.2 What runs where

| Component | Runs on | LLM | Costs us | Byreal credits |
|---|---|---|---|---|
| **RealClaw** (TG bot) | Byreal's servers | Claude (free credits) | $0 | 2000 (~$20) |
| **Web chat** (/api/chat) | Our VPS | DeepSeek | ~$2-5/mo | — |
| **Autonomous loop** | Our VPS | DeepSeek | ~$0.50/mo | — |
| **Sentiment pipeline** | Our VPS | No LLM (API only) | $0 | — |
| **OpenClaw daemon** | Our VPS | DeepSeek | ~$1-2/mo | — |

### 1.3 Why both RealClaw AND our web app

| Surface | Shows judges |
|---|---|
| **RealClaw on TG** | Deep Byreal integration. Agent-driven trading via chat. Uses their platform the way it was designed — with custom skill extension. |
| **Web app chat** | Full Mantle DeFi. Portfolio. Audit trail. Guardrails dashboard. The same byreal-perps-cli under the hood. |
| **Autonomous loop** | Strategy sophistication. Agent trades while you sleep. Every decision on-chain. |

RealClaw = TG-native, uses their hosted Claude, shows Byreal integration depth.
Web app = Mantle-native, our DeepSeek, shows full DeFi breadth + on-chain audit.
Both use **byreal-perps-cli** for execution — same CLI, two surfaces, one identity.

---

## 2. Tool Disambiguation: Mantle vs Byreal

> **Problem:** When the user in Mantis chat says "swap $10 USDC" or "long BTC," how does the LLM know whether they mean Mantle or Byreal Perps?

### 2.1 Disjoint tool namespaces

The 14 tools are named so the LLM can't confuse them. No tool is called `swap` or `trade` — every tool name includes the chain:

```
READ TOOLS (no execution risk):
  getPerpsAccount       → Byreal: balance, margin, free collateral
  listPerpsPositions    → Byreal: open positions with P&L
  listPerpsOrders       → Byreal: open/trigger orders
  getPerpsSignals       → Byreal: market scan + technical analysis
  getPerpsHistory       → Byreal: recent trade history
  getMantlePortfolio    → Mantle: wallet balance, LP positions, lending
  getVaultStatus        → Mantle: AgentVault guardrails, limits, state
  getAuditTrail         → Mantle: ERC-8004 entries, IPFS rationales
  getAgentIdentity      → Mantle: agent ERC-8004 NFT info

WRITE TOOLS (guardrails enforced):
  placePerpsMarketOrder → Byreal: market buy/sell with TP/SL
  placePerpsLimitOrder  → Byreal: limit buy/sell with TP/SL
  closePerpsPosition    → Byreal: close at market or set close-limit
  modifyPerpsPosition   → Byreal: TP/SL, leverage, margin (read: see TP/SL)
  cancelPerpsOrder      → Byreal: cancel one or all orders
  executeMantleSwap     → Mantle: swap via Merchant Moe
  executeMantleLend     → Mantle: deposit/withdraw on Lendle
  submitAuditEntry      → Mantle: write IPFS rationale + ERC-8004 validation
```

### 2.2 System prompt routing table

Added to the system prompt in `route.ts`:

```
You are Mantis, an autonomous DeFi agent. You can trade on TWO platforms:

PLATFORM ROUTING:
  ┌─────────────────────────────────────────────────────────────┐
  │ User says...                    │ Platform   │ Tool         │
  ├─────────────────────────────────────────────────────────────┤
  │ "swap", "trade on Mantle"       │ Mantle     │ executeMantleSwap  │
  │ "lend", "deposit", "withdraw"   │ Mantle     │ executeMantleLend   │
  │ "vault", "guardrails", "audit"  │ Mantle     │ getVaultStatus     │
  │ "portfolio", "my assets"        │ BOTH       │ getMantlePortfolio  │
  │                                 │            │ + listPerpsPositions│
  │ "long BTC", "short ETH"         │ Byreal     │ placePerpsMarketOrder│
  │ "scan markets", "signals"       │ Byreal     │ getPerpsSignals     │
  │ "my positions", "close trade"   │ Byreal     │ listPerpsPositions  │
  │ "perps account", "margin"       │ Byreal     │ getPerpsAccount     │
  │ "stop-loss", "take-profit"      │ Byreal     │ modifyPerpsPosition │
  │ "order", "limit order"          │ Byreal     │ placePerpsLimitOrder│
  │ "cancel order", "cancel all"    │ Byreal     │ cancelPerpsOrder    │
  └─────────────────────────────────────────────────────────────┘

RULE: If the user references a specific coin ticker in a trading context
      (e.g., "BTC", "ETH", "SOL", "long", "short", "position", "leverage"),
      route to BYREAL PERPS.
RULE: If the user references tokens and DeFi verbs ("swap", "lend", "USDC",
      "MNT", "LP", "yield"), route to MANTLE.
RULE: If ambiguous ("what's my position?"), check BOTH platforms and summarize.
```

### 2.3 How the LLM sees it

With disjoint names and a routing table in the system prompt, the LLM never has to guess. "Swap" only appears in `executeMantleSwap`. "Long/short/position/market/limit/TP/SL/leverage" only appear in Byreal tool names. The prompt tells it which is which.

This is the simplest possible disambiguation: **naming convention + system prompt routing table**. No classifier model, no intent parser.

---

## 3. Wallet & Capital Setup

> **Demo capital: $10-20 total.** Trade sizes capped at $3-5 per position.

### 3.1 Three wallets

```
┌─────────────────────────────────────────────────┐
│ Wallet A: RealClaw (hosted, Privy split-key)    │
│ Address: 0x5a6c...9aad                          │
│ Purpose: Manual TG trades (demo interactivity)  │
│ Funding: $5-10 USDC on Hyperliquid              │
│ Our code CANNOT access this private key         │
│ RealClaw manages this entirely                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Wallet B: Autonomous agent (our VPS, env var)   │
│ Purpose: Agent-driven trades via cron           │
│ Funding: $5-10 USDC on Hyperliquid              │
│ Private key: in .env on VPS, NEVER committed    │
│ Max position: $3, max leverage: 2x              │
│ Start: dry-run mode (no real execution)         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Wallet C: Mantle agent (our VPS, env var)       │
│ Purpose: DeFi ops, gas, ERC-8004 journaling     │
│ Funding: $2-5 MNT (gas) + $3-5 USDC (DeFi)     │
│ Private key: in .env on VPS, NEVER committed    │
│ Can be same key as Wallet B (different chains)  │
└─────────────────────────────────────────────────┘
```

### 3.2 Funding checklist

| Step | What | Amount | How |
|---|---|---|---|
| 1 | Buy MNT on exchange | ~$2-5 | Binance, Bybit, etc. |
| 2 | Buy USDC on Arbitrum | ~$15-20 | Exchange → Arbitrum L2 |
| 3 | Bridge USDC to Hyperliquid | ~$10-15 | app.hyperliquid-x.com → deposit |
| 4 | Bridge USDC to Mantle | ~$5 | Mantle bridge or exchange withdrawal |
| 5 | Bridge MNT to Mantle | ~$2-5 | Same as above |
| 6 | Send to agent wallets | All of above | From bridge destination |

### 3.3 Position size math (with $10 on Hyperliquid)

```
With $10 USDC collateral at 2x leverage:

BTC at $64,000:    $20 position = 0.00031 BTC   (may hit min order size)
ETH at $3,500:     $20 position = 0.0057 ETH    (valid)
SOL at $170:       $20 position = 0.117 SOL     (valid)

With $5 USDC at 2x:
BTC: $10 position = 0.00015 BTC                  (may hit min order size)
ETH: $10 position = 0.0028 ETH                   (valid)
SOL: $10 position = 0.058 SOL                    (valid)

Recommendation: start with ETH or SOL. BTC minimum order
size on Hyperliquid is typically 0.001 BTC ($64 at spot).
With 2x leverage you need $32 margin → too much for $10 demo.
```

---

## 4. Safety Architecture

> **Defense in depth.** No single bug can cause significant loss.

### 4.1 Hard limits (enforced in code)

```
maxSingleTrade:    $5    (hard cap in managePerps tool)
maxDailyTrades:    3     (autonomous only)
maxTotalExposure:  $12   (sum of all open positions)
maxLeverage:       2x    (conservative, override requires explicit user consent)
minConfidence:     75%   (sentiment threshold for autonomous trades)
stopLossRequired:  true  (every autonomous position MUST have SL)
```

### 4.2 Mandatory stop-losses

| Coin | Default SL% | Rationale |
|---|---|---|
| BTC | 2% | Lower vol |
| ETH | 3% | Medium vol |
| SOL | 5% | Higher vol, smaller position |

SL is always set as percentage from entry price. At 2x leverage, a 2% SL means ~4% of margin lost — $0.20 on a $5 position. Survivable.

### 4.3 Circuit breakers

```
- 3 consecutive losses → auto-pause autonomous trading (requires manual re-enable)
- 24h P&L below -$3 → auto-pause
- Wallet balance below $5 → auto-pause
- 3 failed CLI calls in a row → auto-pause (something is wrong)
- Position open > 24h without update → alert (might be abandoned)
```

### 4.4 Pre-execution checklist (autonomous trades)

Before any autonomous trade executes:

1. ✅ Total open positions ≤ 2
2. ✅ Position size ≤ $5
3. ✅ SL price computed and valid (right side of entry, >0)
4. ✅ Daily trade count ≤ 3
5. ✅ No circuit breaker active
6. ✅ Sentiment confidence ≥ 75%
7. ✅ Price direction matches sentiment
8. ✅ Rationale logged BEFORE execution (so we see what went wrong if it does)
9. ✅ Wallet balance ≥ (position size / leverage) × 2 (double margin buffer)

---

## 5. Implementation Plan

### PHASE 1: Restore Byreal CLI Integration

**Goal:** Make the codebase actually use Byreal, not our SDK wrapper.

#### Step 1.1: Restore original CLI wrapper

```bash
git checkout 0ed4786 -- src/agent/tools/byreal-perps.ts
rm src/agent/tools/hyperliquid.ts
```

The original `byreal-perps.ts` (393 lines) shells out to `byreal-perps-cli` with `-o json`. It calls the real Byreal CLI for every function. It also has simulation fallback when the CLI binary isn't available.

#### Step 1.2: Verify the build

```bash
npx tsc --noEmit
npm run build
```

Fix any import issues from deleting `hyperliquid.ts`. The 5 files that import from `byreal-perps.ts` should work without changes since the function signatures match.

#### Step 1.3: Read-only smoke test

```bash
byreal-perps-cli account info -o json
byreal-perps-cli signal scan -o json
byreal-perps-cli signal detail ETH -o json
```

**Do not run any write commands** until:
- Account info shows correct balance
- Signal data returns real mainnet prices
- No unexpected open positions

### PHASE 2: Mainnet Configuration

#### Step 2.1: Flip to mainnet

```
# .env changes
NETWORK=mainnet
```

Config already has mainnet defined (chain 5000, RPC, explorer). No code changes needed.

#### Step 2.2: Set Byreal auth

```
# .env additions
BYREAL_PERPS_AGENT_KEY=0x<private-key-for-wallet-B>
BYREAL_PERPS_WALLET_ADDRESS=0x<wallet-B-address>
```

#### Step 2.3: Fund wallets

As per Section 3.2 checklist. Priority order:
1. Hyperliquid wallet B (autonomous agent) — $5-10 USDC
2. Mantle wallet C (gas + DeFi) — $2-5 MNT + $3-5 USDC
3. RealClaw wallet A (TG demo) — $5-10 USDC (optional, can fund later)

#### Step 2.4: Test CLI on mainnet (READ-ONLY)

```bash
byreal-perps-cli account info -o json
byreal-perps-cli position list -o json
byreal-perps-cli signal scan -o json
```

### PHASE 3: CLI Improvements (safety-focused)

The restored byreal-perps.ts works but was written before we had safety concerns. Add:

#### Step 3.1: Pre-execution validation in every write function

```typescript
// Every write function gets this guard:
function validateTrade(params: {
  size: number;
  coin: string;
  leverage: number;
  isAutonomous: boolean;
}) {
  if (params.size > MAX_SINGLE_TRADE) throw new Error(`Size $${params.size} exceeds cap $${MAX_SINGLE_TRADE}`);
  if (params.leverage > MAX_LEVERAGE) throw new Error(`Leverage ${params.leverage}x exceeds cap ${MAX_LEVERAGE}x`);
  if (!APPROVED_MARKETS.includes(params.coin)) throw new Error(`${params.coin} not in approved list`);
  // ... circuit breaker checks
}
```

#### Step 3.2: JSON output validation

The CLI returns JSON. Add a Zod schema to validate every response before the function returns it. If the CLI output is malformed, the function throws instead of returning bad data.

#### Step 3.3: timeout + retry

CLI calls can hang. Add 15s timeout and 1 retry for transient failures.

### PHASE 4: Sentiment Pipeline

**Goal:** Give the agent market awareness so autonomous trades aren't blind.

#### Step 4.1: New file `src/agent/tools/sentiment.ts`

```typescript
// Data sources (all free):
// - CoinGecko /simple/price (price, 24h change)
// - CoinGecko /trending (top movers)
// - Fear & Greed Index (alternative.me API)
// - Hyperliquid metaAndAssetCtxs (funding rates, open interest, mid prices)
// - CryptoPanic RSS (headlines, filtered to crypto)

interface TradeSignal {
  coin: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;         // 0-100
  reasons: string[];          // e.g. "Funding rate -0.003%", "Fear & Greed 72"
  suggestedSizeUsd: number;   // Conservative suggestion
  suggestedLeverage: number;  // 1-2
  riskLevel: 'low' | 'medium' | 'high';
}
```

#### Step 4.2: Signal aggregation logic

```
Score per coin = weighted sum:
  Funding rate:  30%   (negative = bullish, positive = bearish)
  Price trend:   25%   (24h change + 7d momentum)
  Fear & Greed:  20%   (above 60 = bullish, below 40 = bearish)
  News sentiment:15%   (simple keyword count: "bull/up/surge" vs "bear/down/dump")
  Open Interest: 10%   (rising OI + rising price = bullish continuation)

Direction: score > 60 → bullish, score < 40 → bearish, else neutral
Confidence: abs(score - 50) * 2  (distance from neutral, max 100)
```

#### Step 4.3: No Twitter/X API

CryptoPanic RSS + CoinGecko trending + Fear & Greed = sufficient signal. X API costs money and isn't needed for the demo.

### PHASE 5: Autonomous Agent Loop

#### Step 5.1: New file `src/worker/agent-loop.ts`

```
Every 15 minutes (configurable):

1. Fetch sentiment for BTC, ETH, SOL
2. For each coin with confidence ≥ 75%:
   a. Check: circuit breakers, daily limits, balance
   b. Check: already have a position open for this coin?
   c. DeepSeek evaluates:
      "Given [sentiment data], [funding rate], [price action],
       [news headlines about this coin], should we open, close,
       or hold? Respond with action + reasoning."
   d. If OPEN:
      - Size = min($3, available margin with 2x buffer)
      - Attach SL at configured %
      - Log rationale to file
      - Call placePerpsMarketOrder()
      - Submit ERC-8004 validation + IPFS pin rationale
   e. If CLOSE:
      - Call closePerpsPosition()
      - Log realized PnL
   f. If HOLD:
      - Log: "No action. Confidence X%, below threshold."
      - Check existing positions: SL still in place? Adjust if needed.
```

#### Step 5.2: Dry-run mode

```
DRY_RUN = true   ← START HERE. DO NOT SKIP.

In dry-run mode:
- Everything runs EXCEPT the actual trade execution
- Logs: "DRY RUN: Would LONG BTC $3 at $64,060 (2x, 2% SL)"
- Run for at least 4 cycles (1 hour) before flipping to false
- Review every log entry before enabling real execution
```

#### Step 5.3: Run via PM2 on VPS

```bash
pm2 start src/worker/agent-loop.ts --name agent-loop
pm2 save
pm2 startup
```

### PHASE 6: RealClaw Skill (TG Bridge)

#### Step 6.1: The Mantis skill file

The skill teaches RealClaw about our Mantle API. Place at `~/.openclaw/workspace/skills/mantis/SKILL.md`:

```markdown
---
name: mantis
description: Query Mantis Mantle DeFi portfolio, vault state, and on-chain audit trail
user-invocable: true
---

## Mantis — Mantle DeFi Agent

Mantis manages DeFi on Mantle (chain 5000) and trades perps via Byreal.
Use this skill to query Mantle-side state through the Mantis API.

### Check Agent Status
GET https://<vps-ip>:3000/api/status
Returns: vault health, guardrail state, network info, uptime

### Query Portfolio
POST https://<vps-ip>:3000/api/chat
Body: { "message": "show my portfolio" }
Returns: Mantle balances, LP positions, lending deposits, perps positions

### View Audit Trail
POST https://<vps-ip>:3000/api/chat
Body: { "message": "show audit trail" }
Returns: ERC-8004 entries, IPFS CIDs, trade rationales

### Run Market Scan
POST https://<vps-ip>:3000/api/chat
Body: { "message": "scan markets" }
Returns: sentiment scores, funding rates, price action for BTC/ETH/SOL

### When NOT to use this skill
- User wants to execute a trade — use the built-in Byreal Perps skill
- User wants Solana actions — use the built-in Byreal Solana skill
```

#### Step 6.2: Install the skill

Three options, test in order:

**Option A: GitHub install** (if RealClaw supports it)
```
In TG: "npx skills add notshreshth/mantis-skill"
```

**Option B: API endpoint** (if RealClaw has a config API)
```
POST https://api.byreal.io/v1/agents/<agent-id>/skills
```

**Option C: Self-hosted OpenClaw** (fallback — we control it)
```bash
npm install -g openclaw@latest
openclaw start
# Skill goes in ~/.openclaw/workspace/skills/mantis/SKILL.md
# Connects to TG via bot token
# Uses our DeepSeek key instead of Claude
```
This costs us LLM usage but gives us full control.

#### Step 6.3: Test the bridge

```
User (TG): "What's in my Mantle vault?"
RealClaw → Mantis skill → GET /api/status
         → "Your Mantle vault at 0x... has $3 USDC, $2 MNT.
            Guardrails active. 2 audit entries on-chain."
```

### PHASE 7: ERC-8004 Identity + AgentVault

#### Step 7.1: Deploy AgentVault to Mantle mainnet

Use same Solidity as testnet deployment (in `contracts/`). Deploy via Hardhat:
```bash
npx hardhat run scripts/deploy-agent-vault.ts --network mantle-mainnet
```
Update `config.ts` with the deployed address.

#### Step 7.2: Mint ERC-8004 identity

```typescript
const tx = await wallet.writeContract({
  address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  abi: IDENTITY_REGISTRY_ABI,
  functionName: 'mintIdentity',
  args: ['Mantis', 'Autonomous AI DeFi agent on Mantle and Byreal Perps...', 'ipfs://<CID>']
});
```

Pin metadata JSON to Pinata first (free tier, 500 uploads).

#### Step 7.3: Submit first validation

After first autonomous trade completes, submit to ValidationRegistry:
```typescript
await validationRegistry.submitValidation(
  agentTokenId,
  'TRADE_EXECUTION',
  'ipfs://<rationale-cid>',
  txHash
);
```

### PHASE 8: Demo Prep

#### 8.1 The 3-minute demo flow

```
[0:00-0:30] PROBLEM
"DeFi is fragmented. 14 tools, 2 chains, guardrails, audits.
Nobody has time for this. You shouldn't need a PhD to earn yield."

[0:30-1:15] TG DEMO (RealClaw + Byreal)
Judge watches TG screen:
  User: "Scan the markets. What looks good?"
  Mantis: [Byreal Perps skill + Mantis skill]
    "ETH: bullish. Funding -0.003%, RSI 62, price $3,500.
     SOL: neutral. BTC: slightly bearish.
     I'd suggest a small ETH long."
  User: "Do it. $5 ETH long with 2x and 2% stop-loss."
  Mantis: [executes via Byreal Perps CLI]
    "Done. Position 0.0028 ETH long at $3,502.
     SL at $3,432. Live: app.hyperliquid.xyz/trade/ETH"

[1:15-1:45] AUTONOMOUS DEMO (Dashboard)
Switch to web dashboard:
  "RealClaw is great when you're chatting. But the agent works
   while you sleep too."
  Show: autonomous loop detected SOL sentiment spike
  → opened $3 SOL long at 2x
  → journaled on Mantle: tx hash, IPFS rationale, ERC-8004 entry
  → current P&L: +$0.18

[1:45-2:15] AUDIT TRAIL (Mantle explorer)
  "Every decision is permanent and verifiable."
  Show: Mantle explorer
  → ERC-8004 Identity NFT (Mantis v1.0.0)
  → Validation Registry entries (timestamped, with IPFS links)
  → IPFS: human-readable rationale for every trade
  "You can audit an AI the same way you audit a human."

[2:15-2:45] GUARDRAILS
  "And it can't go rogue."
  Show: Guardrail dashboard
  → $5 max single trade
  → 3 trades/day cap
  → Circuit breaker: 3 losses → pause
  → AgentVault is on-chain. Not bypassable in TypeScript.
  → 1hr withdrawal timelock protects funds.

[2:45-3:00] CLOSE
  "Mantis. Autonomous DeFi with on-chain accountability.
   Byreal for execution. Mantle for trust.
   Built for Tracks A and B of the Turing Test Hackathon."
```

---

## 6. Files

### Restore from git
```
src/agent/tools/byreal-perps.ts    ← git checkout 0ed4786
```

### Delete
```
src/agent/tools/hyperliquid.ts     ← our SDK wrapper
```

### Update
```
.env                              ← NETWORK=mainnet, wallet keys
src/agent/config.ts               ← AgentVault mainnet address
src/agent/tools/byreal-perps.ts   ← add safety validations
~/.openclaw/workspace/skills/mantis/SKILL.md  ← RealClaw bridge
src/app/api/chat/route.ts         ← update system prompt with routing table
```

### Create
```
src/agent/tools/sentiment.ts      ← Market sentiment & news
src/worker/agent-loop.ts          ← Autonomous trading loop
src/app/api/status/route.ts       ← Status endpoint for RealClaw skill
```

### Deploy
```
AgentVault → Mantle mainnet       ← Same bytecode as testnet
```

---

## 7. Costs

### One-time

| Item | Amount |
|---|---|
| Deploy AgentVault to Mantle mainnet | ~$1-2 MNT |
| Mint ERC-8004 identity NFT | ~$0.50 MNT |
| Pinata IPFS pin | $0 (free tier) |
| **Total** | **~$2-3** |

### Monthly

| Item | Monthly |
|---|---|
| Hetzner CX23 VPS (2 vCPU, 4GB, 40GB) | €4.49 |
| DeepSeek API (web chat + autonomous loop) | ~$3-8 |
| Mantle gas (journaling, occasional swaps) | ~$1-3 |
| Hyperliquid gas | $0 (negligible) |
| RealClaw hosting + Claude | $0 (free credits) |
| CoinGecko, Fear & Greed, CryptoPanic | $0 |
| **Total** | **~€10-15** |

### Demo capital (not a cost — it's your money)

| Wallet | Amount | Purpose |
|---|---|---|
| Hyperliquid perps | $5-10 USDC | TG demo trades + autonomous |
| Mantle MNT | $2-5 | Gas for journaling |
| Mantle USDC | $3-5 | DeFi demo (swap, lend) |
| **Total** | **$10-20** | |

---

## 8. Implementation Order

```
1. □ Restore byreal-perps.ts from git (0ed4786)
     Delete hyperliquid.ts. Verify build.

2. □ Flip NETWORK=mainnet, set Byreal auth env vars

3. □ Fund Hyperliquid wallet ($5-10 USDC)
     Test: CLI read commands on mainnet

4. □ Add safety validations to byreal-perps.ts
     Max size, leverage caps, circuit breakers

5. □ Test first manual trade via CLI (not via code!)
     $3 ETH long with SL. Close after 5 min.
     MUST work before anything else.

6. □ Build sentiment module
     Wire CoinGecko + Fear & Greed + CryptoPanic

7. □ Build autonomous loop
     DRY_RUN=true. Run 4 cycles. Review logs.
     Then DRY_RUN=false, $3 max, supervised.

8. □ Deploy AgentVault to Mantle mainnet
     Fund Mantle wallet. Mint ERC-8004 identity.

9. □ Create status API endpoint for RealClaw

10. □ Extend RealClaw with Mantis skill
     Test TG → skill → API → response

11. □ Prepare and film demo
```

---

## 9. Emergency Procedures

```
IF SOMETHING GOES WRONG:

1. KILL THE AGENT LOOP
   ssh into VPS → pm2 stop agent-loop
   Agent stops immediately. No new orders.

2. CLOSE ALL POSITIONS
   byreal-perps-cli position close-all -y
   Or via RealClaw TG: "close all positions"

3. WITHDRAW FUNDS
   From Hyperliquid: use the HL app to bridge back to Arbitrum
   From Mantle: send back to exchange wallet

4. REVIEW WHAT HAPPENED
   Check logs at /var/log/mantis/agent-loop.log
   Check audit trail on Mantle explorer
   Post-mortem before re-enabling anything
```

---

## 10. What We're NOT Building

To keep this achievable:

- **No copy-trading.** Adds wallet monitoring infra, risk of copying bad actors. Skip for v1.
- **No self-hosted OpenClaw unless needed.** RealClaw is free and already working. Only self-host if RealClaw can't load custom skills.
- **No multi-coin autonomous trading initially.** Start with just ETH. Add BTC/SOL after ETH works.
- **No Twitter/X integration.** Free data sources are enough for the demo.
- **No frontend redesign.** The current UI works. Polish after integration is solid.
