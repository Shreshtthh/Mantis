# Mantis Demo Script -- Turing Test Hackathon 2026

**Duration:** 3-4 minutes
**Tracks:** Track A (Mirana -- DeFi Strategy) + Track B (Byreal -- Agentic Economy)

---

## BEFORE RECORDING

### Open these windows (arrange so you can switch between them):

| Window | What's running |
|--------|---------------|
| **Terminal 1** (large) | `npm run dev` -- leave it visible to show CLI logs |
| **Browser** | `http://localhost:3000` -- fresh chat, no history |
| **Terminal 2** (side) | For manual CLI commands during the video |
| **VS Code** (optional) | `src/worker/agent-loop.ts` open to show during Scene 5 |

### Prep commands (run in Terminal 2 before recording):

```bash
cd /root/metamask-cook-off/TuringTestHackathon
export BYREAL_PERPS_AGENT_KEY=$(grep BYREAL_PERPS_AGENT_KEY .env | cut -d= -f2)
export BYREAL_PERPS_WALLET_ADDRESS=$(grep BYREAL_PERPS_WALLET_ADDRESS .env | cut -d= -f2)

# Verify everything works
byreal-perps-cli -o json account info     # should show $19.61
byreal-perps-cli -o json signal scan       # should show 30 coins
byreal-perps-cli -o json position list     # should be empty
```

### Checklist:
- [ ] Dark mode on everything (terminal, browser, editor)
- [ ] Font size 14-16pt in terminal (readable on video)
- [ ] Close Slack, email, unrelated tabs, desktop icons
- [ ] Screen recorder at 1920x1080, system audio OFF
- [ ] Test your mic -- voiceover only, no keyboard sounds
- [ ] `DRY_RUN=true` in `.env`

---

## SCENE 1: The Product (0:00-0:25)

**Show:** Browser dashboard at `localhost:3000`

> "This is Mantis -- an autonomous AI agent that trades perpetual futures on Hyperliquid through the Byreal Perps CLI, and manages DeFi on Mantle. Fifteen tools across two chains, one natural language interface. Every decision audited on-chain with ERC-8004."

**Actions:**
- Point to the dashboard widgets (portfolio, gas price, positions)
- Point to the chat input

> "Let me show you the integrations. Real money. Real execution. Real on-chain identity."

---

## SCENE 2: Byreal Perps CLI -- Live Hyperliquid (0:25-1:00)

**Show:** Switch to Terminal 2. Run these in order, read key values aloud.

> "Mantis talks to Hyperliquid through the Byreal Perps CLI. This is a live mainnet account -- no simulation, no testnet. Let me prove it."

### Step 1: Account
```
byreal-perps-cli -o json account info
```
**Point to:** `"accountValue": "19.610000"`, `"withdrawable": "19.610000"`, `"address": "0x92CB..."`

> "Nineteen sixty-one USDC. Live on Hyperliquid mainnet. Fully withdrawable."

### Step 2: Signal scan
```
byreal-perps-cli -o json signal scan
```
**Scroll through output, point to:** BTC, ETH, SOL prices. Real RSI values, real funding rates.

> "Thirty coins scanned. Conservative, moderate, aggressive tiers. Funding rates, RSI, volume, open interest. Eleven DEX order books. All live."

### Step 3: Detailed analysis
```
byreal-perps-cli -o json signal detail ETH
```
**Point to:** price, RSI, MACD, EMA7 > EMA25, trend direction.

> "Per-coin technicals. Oracle price, Bollinger Bands, trend alignment, a trading suggestion. This is the data Mantis feeds to its LLM for decision-making."

---

## SCENE 3: Agent Wallet -- Autonomous Decision Pipeline (1:00-1:30)

**Show:** Terminal 2. Walk through how the agent's wallet and autonomous loop work.

> "The agent has its own Hyperliquid wallet. I funded it with $19.61 USDC through the Arbitrum bridge. When the autonomous loop fires, it checks this balance, reads market data through the CLI, and feeds everything into DeepSeek for evaluation."

### Step 1: Recap the wallet
```
byreal-perps-cli -o json account info
```
**Point to:** `"accountValue": "19.610000"`, `"withdrawable": "19.610000"`

> "Fully withdrawable USDC. The agent key signs every transaction. This is a real wallet with real funds."

### Step 2: Show the signal the agent would evaluate
```
byreal-perps-cli -o json signal detail ETH
```
**Point to:** RSI, MACD, EMA values, trend.

> "The autonomous loop runs `signal detail` on each coin, aggregates it with Fear and Greed, CoinGecko price, and news headlines. Four sources in parallel, in-memory caching."

### Step 3: Single dry-run cycle
```
DRY_RUN=true npx tsx src/worker/agent-loop.ts
```
**Point to:** the "Would LONG ETH" or "HOLD" log line.

> "DeepSeek evaluates at temperature zero. Returns OPEN, CLOSE, or HOLD. Circuit breakers: three consecutive losses auto-pauses. Five dollar daily loss cap. Minimum balance threshold. Dry-run shows what it would do. Flip DRY_RUN=false and it trades."

---

## SCENE 4: AI Chat -- Market Intelligence (1:30-2:10)

**Show:** Switch to browser. Type each message, let it complete.

> "The chat interface connects DeepSeek's LLM to 15 tools. The agent routes natural language to the right blockchain -- Byreal for perps, Mantle for DeFi."

### Message 1: "What's my portfolio?"
> Shows Hyperliquid account, Mantle wallet balances, open positions.
**Point to Terminal 1:** the CLI logs (`⚡ byreal-perps-cli -o json account info ✅ OK`)

### Message 2: "Analyze market sentiment for ETH"
> Shows Fear & Greed Index, CoinGecko price, CryptoPanic news, funding rate, directional score with confidence percentage.
**Point to Terminal 1:** the sentiment logs (`📊 SENTIMENT: Fetching data for ETH... ✓`)

### Message 3: "What's the strategy right now?"
> Shows strategy proposal: market signals + whale activity + yield comparison + sentiment -> recommendation.

> "The agent pulled data from four free sources -- Fear and Greed, CoinGecko, CryptoPanic RSS, and Hyperliquid funding rates -- all in parallel. No API keys required. Then DeepSeek evaluated it and produced a structured recommendation with reasoning."

---

## SCENE 5: Autonomous Agent Loop Live (2:10-2:40)

**Show:** Terminal 2 -- start the loop fresh.

> "Scene 3 was a single cycle. Now let it run live. Every 10 minutes it fetches sentiment, evaluates, and decides."

```
DRY_RUN=true npx tsx src/worker/agent-loop.ts --loop
```

**Walk through the first cycle output:**

> "Config banner -- dry run mode, ETH only, 2x leverage, $20 max position, 75% minimum confidence, $5 daily loss cap."

> "Cycle starts. Checks wallet -- $19.61 equity. Fetches sentiment for ETH -- Fear and Greed, CoinGecko price, news headlines, funding rates from Byreal."

> "DeepSeek evaluates: OPEN, CLOSE, or HOLD with reasoning. In dry run mode it logs what it WOULD do without executing."

> "Circuit breakers: three consecutive losses pauses. Five dollar daily loss cap pauses. Minimum balance threshold. Stop-loss attached to every trade. The agent cannot go rogue because the code will not let it."

---

## SCENE 6: ERC-8004 On-Chain Identity (2:40-3:05)

**Show:** Switch to browser. Type in chat:

> "Every Mantis action is permanently auditable on-chain. ERC-8004 gives AI agents an identity -- name, version, metadata -- stored immutably on Mantle."

**Message:** "Show my agent identity"

> Shows address, ERC-8004 IdentityRegistry at `0x8004A169...`, Token ID 132.

> "The Identity Registry is deployed on Mantle mainnet. 183 agents already registered. Mantis is Token 132. Metadata pinned to IPFS. Every trade rationale gets hashed and submitted for audit."

> "You can verify WHY Mantis traded, WHEN, and whether it followed its rules. You audit an AI the same way you audit a human trader -- by looking at the decisions."

---

## SCENE 7: Architecture Summary (3:05-3:25)

**Show:** VS Code or terminal showing project structure

```
tree src/agent src/worker src/app -I 'node_modules' --dirsfirst
```

> "Track A -- DeFi Strategy: Merchant Moe DEX swaps, Lendle lending, yield comparison, whale tracking, multi-protocol routing through the AgentVault with on-chain guardrails."

> "Track B -- Byreal Agentic Economy: Real CLI integration with live Hyperliquid account, 15-tool AI agent, autonomous trading loop with DeepSeek evaluation and circuit breakers."

> "ERC-8004: On-chain agent identity, IPFS audit trail, reputation scoring. Every action permanently verifiable."

---

## SCENE 8: Closing (3:25-3:40)

**Show:** Back to the dashboard

> "Mantis proves that an AI agent can trade perps, manage DeFi, and audit itself on-chain -- all from natural language. Built for the Turing Test Hackathon 2026."

**TEXT ON SCREEN:**
```
Mantis
Autonomous DeFi Agent
Byreal Perps x Hyperliquid x Mantle x ERC-8004
```

> "Thank you."

---

## QUICK REFERENCE -- Commands for Recording

### Scene 2 (CLI reads):
```bash
byreal-perps-cli -o json account info
byreal-perps-cli -o json signal scan
byreal-perps-cli -o json signal detail ETH
```

### Scene 3 (agent wallet + decision pipeline):
```bash
byreal-perps-cli -o json account info
byreal-perps-cli -o json signal detail ETH
DRY_RUN=true npx tsx src/worker/agent-loop.ts
```

### Scene 5 (agent loop):
```bash
DRY_RUN=true npx tsx src/worker/agent-loop.ts --loop
```

### Scene 7 (architecture):
```bash
tree src/agent src/worker src/app -I 'node_modules' --dirsfirst
```

---

## SCORING REFERENCE -- Byreal Track B

| Criterion | Max | What we show |
|-----------|-----|-------------|
| Integration Depth | 18 | Live CLI account ($19.61), signal scan (30 coins, 11 DEXes), per-coin technical analysis, CLI output in terminal |
| Agent Autonomy | 14 | Autonomous loop with DeepSeek, 4-source sentiment aggregation, circuit breakers, dry-run/live toggle |
| Use Case Clarity | 10 | NLP->tool routing, clear chain separation (Byreal=perps, Mantle=DeFi), 15 tools |
| Verifiability | 8 | ERC-8004 on-chain identity (Token 132), IPFS audit trail, terminal-visible CLI logs |

## SCORING REFERENCE -- Mirana Track A

| Criterion | Max | What we show |
|-----------|-----|-------------|
| Strategy Logic | 20 | 4-source sentiment -> weighted scoring -> LLM evaluation -> trade decision |
| Risk Management | 15 | Circuit breakers (loss cap, consecutive losses, min balance), stop-loss on every trade, vault-enforced limits |
| Execution Quality | 10 | Real Hyperliquid mainnet account with $19.61 USDC, full read pipeline, live agent wallet architecture |
| Innovation | 5 | ERC-8004 audit trail, autonomous loop, cross-chain tool routing |
