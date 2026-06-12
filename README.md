# 🦗 Mantis — Autonomous AI DeFi Agent

<div align="center">

**Turing Test Hackathon 2026 · AI Awakening Phase 2**
*Agentic Wallets & Economy (Byreal) · AI Alpha & Data (Mirana)*

[![Mantle](https://img.shields.io/badge/Network-Mantle%20Sepolia-00D18C?logo=mantle)](https://explorer.sepolia.mantle.xyz)
[![AgentVault](https://img.shields.io/badge/AgentVault-0xA0a4...0659-blue)](https://explorer.sepolia.mantle.xyz/address/0xA0a402A3e9C7Cee0CA45911D9BA2673b53140659)
[![AI SDK](https://img.shields.io/badge/AI%20SDK-v6-black?logo=vercel)](https://sdk.vercel.ai)
[![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-purple)](https://deepseek.com)

</div>

---

## 🎯 What is Mantis?

**Mantis is an autonomous AI agent that manages a DeFi portfolio for you.** You deposit funds into its on-chain vault, chat with it in natural language, and it executes swaps, yield farming, and leveraged perps trading — all while enforcing hardcoded risk guardrails and publishing every decision to IPFS as a permanent audit trail.

> *"Mantis, the markets are looking good. Deploy $200 into a BTC long with 2x leverage and park the rest in Lendle USDC."*

Mantis will:
1. Analyze market signals (funding rates, technical indicators, whale activity)
2. Propose a strategy with reasoning
3. Execute the BTC perps trade via Byreal and deposit USDC into Lendle
4. Hash the rationale, pin it to IPFS, and submit it to the ERC-8004 Validation Registry
5. Show you the tx hashes with explorer links

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          USER EXPERIENCE                              │
│                                                                      │
│  ┌─────────────┐     ┌───────────────────┐     ┌─────────────────┐  │
│  │  MetaMask    │     │   Chat Interface   │     │   Dashboard     │  │
│  │  Connect     │     │   "Swap 100 USDC   │     │   Portfolio     │  │
│  │  Deposit     │     │    for WETH"       │     │   Positions     │  │
│  │  Withdraw    │     │                    │     │   Vault State   │  │
│  └──────┬───────┘     └────────┬──────────┘     └────────┬────────┘  │
│         │                      │                         │           │
└─────────┼──────────────────────┼─────────────────────────┼───────────┘
          │                      │                         │
          ▼                      ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS 14 APP ROUTER                         │
│                                                                      │
│  /api/chat          /api/status         /api/withdraw               │
│  ┌──────────────┐   ┌──────────────┐    ┌──────────────┐           │
│  │ 14-tool      │   │ Wallet       │    │ Vault-based  │           │
│  │ registry     │   │ Vault state  │    │ timelocked   │           │
│  │ streamText() │   │ Guardrails   │    │ withdrawals  │           │
│  │ DeepSeek     │   │ Positions    │    │              │           │
│  └──────┬───────┘   └──────────────┘    └──────────────┘           │
└─────────┼───────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        AI AGENT CORE                                  │
│                                                                      │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ System Prompt  │  │  Guardrails  │  │     Self-Auditor         │ │
│  │ • Personality  │  │  🔴 Hard     │  │  • SHA-256 rationale     │ │
│  │ • Capabilities │  │  🟡 Soft     │  │  • Pinata IPFS pinning   │ │
│  │ • Risk-aware   │  │  🟢 Circuit  │  │  • ERC-8004 submission   │ │
│  └────────────────┘  └──────────────┘  └──────────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    14-TOOL REGISTRY                            │   │
│  │                                                               │   │
│  │  READ (7):  Portfolio · Yields · Market Intel · Audit Trail   │   │
│  │             Agent Identity · Perps Account · Strategy Proposals│   │
│  │                                                               │   │
│  │  WRITE (7): swapTokens · manageLending · managePerps          │   │
│  │             withdrawFunds · selfAudit · setGuardrails         │   │
│  │             killSwitch · confirmPerpsAction                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐  ┌───────────┐  ┌──────────────┐
   │ Mantle  │  │ AgentVault│  │  Byreal CLI   │
   │  RPC    │  │  0xA0a4…  │  │  Hyperliquid   │
   └────┬────┘  └─────┬─────┘  └──────┬───────┘
        │             │               │
        ▼             ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Merchant Moe │ │   Lendle     │ │  Perps       │
│    DEX       │ │  Lending     │ │  BTC·ETH·SOL │
│ (Uniswap V2) │ │ (Aave V2)    │ │  max 5x lev  │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **AgentVault on-chain guardrails** | The agent **cannot** bypass limits. Checks happen in the smart contract, not just in TypeScript. Defense in depth. |
| **User is the vault owner** | The user retains ultimate control. They can pause the vault, tighten guardrails, or withdraw all funds via timelock — even if the agent is compromised. |
| **1-hour withdrawal timelock** | Gives users time to detect anomalies before a malicious agent could drain funds. Owner can cancel pending withdrawals. |
| **Separate agent & owner roles** | The agent EOA executes trades. The owner EOA manages guardrails and emergency withdrawals. Never the same address in production. |
| **DeepSeek via Vercel AI SDK v6** | Streaming tool-calling with Zod schema validation. The agent decides *which* tool to call; the code enforces *how* it executes. |
| **Self-audit to IPFS + ERC-8004** | Every trade leaves a permanent, verifiable paper trail. Rationale hash is pinned to IPFS and submitted on-chain. Cannot be deleted or altered. |

---

## 🔒 Security: The Vault Architecture

### What is the AgentVault?

The AgentVault is a smart contract deployed on Mantle that sits between the user's funds and the AI agent. **The agent never holds user funds directly.** Every trade flows through `vault.execute()` which enforces:

```solidity
function execute(
    address target,        // DeFi protocol to call
    uint256 value,         // Native MNT to send (usually 0)
    bytes calldata data,   // Encoded swap/deposit/withdraw calldata
    uint256 valueUsd,      // Estimated USD value (for guardrails)
    string calldata rationaleCid  // IPFS audit rationale
) external onlyAgent whenNotPaused returns (bool, bytes memory)
```

**On-chain enforcement (not bypassable by the agent):**
- `valueUsd > maxSingleTradeUsd` → reverts with `ExceedsSingleTradeLimit`
- Rolling 24h spend cap: `dailySpentUsd > maxDailySpendUsd` → reverts with `ExceedsDailySpendLimit`
- `paused == true` → reverts with `VaultPaused`
- Only the `agent` address can call `execute()`
- Only the `owner` can pause, adjust guardrails (tighten only), or withdraw

**Deployed:** [`0xA0a402A3e9C7Cee0CA45911D9BA2673b53140659`](https://explorer.sepolia.mantle.xyz/address/0xA0a402A3e9C7Cee0CA45911D9BA2673b53140659) on Mantle Sepolia

### Emergency Withdrawal Flow

```
User detects anomaly
  → Calls vault.pause() from MetaMask          ← Agent is immediately blocked
  → Calls vault.requestWithdrawal(token)       ← Starts 1-hour timelock
  → Wait 1 hour (or cancel if false alarm)
  → Calls vault.executeWithdrawal()            ← All funds returned to owner
```

---

## 🧠 The AI Agent

### 14-Tool Registry

Mantis uses the Vercel AI SDK v6 `tool()` API with Zod-validated input schemas. The LLM (DeepSeek) chooses which tool to call; TypeScript executes it with guardrails.

#### Read Tools (no guardrails needed)

| # | Tool | Description |
|---|---|---|
| 1 | `getPortfolio` | Full portfolio: Mantle wallet + Lendle positions + Byreal perps + P&L |
| 2 | `getYields` | Cross-protocol yield comparison (Lendle, Merchant Moe LP, mETH staking) |
| 3 | `getMarketIntel` | 4-in-1: signal scanner, technical analysis, whale tracking, DEX analytics |
| 4 | `getAuditTrail` | IPFS CIDs and ERC-8004 validation hashes from past actions |
| 5 | `getAgentIdentity` | ERC-8004 on-chain identity NFT, metadata, reputation score |
| 6 | `getPerpsAccount` | Byreal/Hyperliquid: account info, positions, orders, trade history |
| 7 | `getStrategyProposal` | AI-synthesized recommendation from signals + yields + whales + portfolio |

#### Write Tools (all guardrailed)

| # | Tool | Guardrails |
|---|---|---|
| 8 | `swapTokens` | Token whitelist · max trade size · vault execution · auto-audit |
| 9 | `manageLending` | Token whitelist · max deposit · vault execution · auto-audit |
| 10 | `managePerps` | Market whitelist · max 5x leverage · $500 max position · requires approval |
| 11 | `withdrawFunds` | Vault-based timelocked withdrawal · owner-only · encoded calldata for MetaMask |
| 12 | `selfAudit` | Manual trigger for ERC-8004 validation |
| 13 | `setGuardrails` | Can only tighten, never loosen beyond defaults |
| 14 | `killSwitch` | Emergency pause all trading |

### Guardrail Engine (3 Layers)

```
🔴 HARD GUARDRAILS (block immediately)
├── Kill switch engaged → blocked
├── Circuit breaker tripped (3+ consecutive losses) → blocked
├── Token/market not whitelisted → blocked
├── Trade > $500 absolute max → blocked
├── Leverage > 5x → blocked
├── Daily loss > $200 → blocked
└── Gas anomaly (> 50 gwei) → blocked

🟡 SOFT GUARDRAILS (require user approval)
├── Trade > $100 → "Confirm this trade?"
├── Lendle deposit > $200 → "Confirm this deposit?"
└── ALL perps positions → always require confirmation

🟢 CIRCUIT BREAKERS (post-execution, automatic)
├── 3+ consecutive failed txs → auto-pause
├── Daily loss ≥ $200 → auto-pause
└── Slippage exceeded → warn
```

### Self-Audit Trail (ERC-8004)

Every successful action is permanently recorded:

1. **Build** rationale JSON: `{ action, params, reasoning, guardrailChecks, result }`
2. **Hash** it with SHA-256
3. **Pin** to IPFS via Pinata
4. **Submit** hash + CID to the ERC-8004 Validation Registry on Mantle

```json
{
  "timestamp": "2026-06-08T15:45:00.000Z",
  "action": "swapTokens",
  "userPrompt": "swap 100 USDC for WETH",
  "agentReasoning": "Executed swapTokens with params: {tokenIn:USDC, tokenOut:WETH, amount:100}",
  "guardrailChecks": { "tokenApproved": true, "amountWithinLimit": true },
  "txHash": "0x1234...",
  "network": "mantle-sepolia",
  "agentVersion": "1.0.0"
}
```

---

## 📊 Byreal Perps Integration (Hyperliquid)

Mantis trades perpetual futures on Hyperliquid via the `@byreal-io/byreal-perps-cli`. This is a real CLI that executes orders on Hyperliquid's orderbook — not a simulation.

### Capabilities

| Operation | CLI Command | Mantis Tool |
|---|---|---|
| Market buy/long | `byreal-perps-cli order market long <size> <coin>` | `managePerps` |
| Market sell/short | `byreal-perps-cli order market short <size> <coin>` | `managePerps` |
| Limit orders | `order limit long/short <size> <coin> <price>` | `managePerps` |
| Set TP/SL | `position tpsl <coin> --tp <x> --sl <y>` | `managePerps` |
| Close position | `position close-market <coin>` | `managePerps` |
| Set leverage | `position leverage <coin> <x>` | `managePerps` |
| Market scanner | `signal scan` | `getMarketIntel` |
| Technical analysis | `signal detail <coin>` | `getMarketIntel` |
| Account + positions | `account info` / `position list` | `getPerpsAccount` |

### Safety

The guardrail engine hardcaps leverage at **5x** (Byreal's maximum is 40x). Position size is capped at **$500**. Every perps trade requires explicit user confirmation. All CLI results are validated and wrapped in a consistent `TxResult` interface.

When the CLI binary is unavailable (deployed environments), the system gracefully degrades to simulated responses so the chat experience never breaks.

---

## 📦 Smart Contracts

### `contracts/AgentVault.sol`

The core of the architecture. ~310 lines of Solidity.

| Feature | Implementation |
|---|---|
| Agent execution | `execute(target, value, data, valueUsd, rationaleCid)` |
| Daily spend tracking | Rolling 24h window, auto-resets |
| Emergency withdrawal | 2-step: `requestWithdrawal` → wait → `executeWithdrawal` |
| Guardrail management | Owner can only **tighten** limits, never loosen |
| Pause/unpause | Owner-only emergency kill switch |
| Agent upgrade | `setAgent(newAgent)` for migrations |
| Events | `AgentExecuted`, `WithdrawalRequested/Executed/Cancelled`, `Paused/Unpaused` |
| Receive | Native MNT accepted via `receive()` |

### `contracts/MockERC20.sol`

ERC-20 test tokens with a public `mint()` function. Used on Mantle Sepolia for demo deposits, swaps, and lending.

### Deploy Script (`scripts/deploy.ts`)

Standalone deployment using `solc` + `viem` + `encodeAbiParameters`. No Hardhat dependency for deployment. Works with any RPC.

---

## 🌐 Deployed Contracts (Mantle Sepolia)

| Contract | Address | Purpose |
|---|---|---|
| **AgentVault** | [`0xA0a402A3e9C7Cee0CA45911D9BA2673b53140659`](https://explorer.sepolia.mantle.xyz/address/0xA0a402A3e9C7Cee0CA45911D9BA2673b53140659) | On-chain programmable wallet with guardrails |
| **MockSwapRouter** | [`0x3B38E69728798BF5239D13654ca63e9ad3885A44`](https://explorer.sepolia.mantle.xyz/address/0x3B38E69728798BF5239D13654ca63e9ad3885A44) | Uniswap V2-compatible mock DEX |
| **MockLendingPool** | [`0x7C165db385c4cd4f1355b916aF7Ec33eA06317E9`](https://explorer.sepolia.mantle.xyz/address/0x7C165db385c4cd4f1355b916aF7Ec33eA06317E9) | Aave V2-compatible mock lending |
| **tUSDC** | [`0x207Efefb16e7Dd9B395E4aCd6fEa7046b80995F6`](https://explorer.sepolia.mantle.xyz/address/0x207Efefb16e7Dd9B395E4aCd6fEa7046b80995F6) | Mock USDC (6 decimals) |
| **tUSDT** | [`0x36a5927B95B7ed104aD1F81Bb23b274bAB40945e`](https://explorer.sepolia.mantle.xyz/address/0x36a5927B95B7ed104aD1F81Bb23b274bAB40945e) | Mock USDT (6 decimals) |
| **tWETH** | [`0xdD4FbDF97d4Ff3CB19D7D22562845f9f7084CFeD`](https://explorer.sepolia.mantle.xyz/address/0xdD4FbDF97d4Ff3CB19D7D22562845f9f7084CFeD) | Mock WETH (18 decimals) |
| **tmETH** | [`0x8b298654063c4BB76ADea8584B2277A170878613`](https://explorer.sepolia.mantle.xyz/address/0x8b298654063c4BB76ADea8584B2277A170878613) | Mock mETH (18 decimals) |
| **tWMNT** | [`0x91C0eBe211095F213ebE899662dE99Fe38f542d9`](https://explorer.sepolia.mantle.xyz/address/0x91C0eBe211095F213ebE899662dE99Fe38f542d9) | Mock WMNT (18 decimals) |

**Vault parameters:**
- `agent`: `0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6`
- `maxSingleTradeUsd`: 500
- `maxDailySpendUsd`: 2,000
- `withdrawalDelay`: 3,600 seconds (1 hour)

**MockRouter rates:**
- 1 USDC ≈ 0.80 WMNT · 1 WETH ≈ 2,500 USDC · 1 mETH ≈ 2,600 USDC · 1 mETH ≈ 1.04 WETH

**MockLendingPool APYs:**
- USDC: 6.20% · USDT: 5.80% · WETH: 2.80% · mETH: 3.10% · WMNT: 4.50%

All addresses are also recorded in `artifacts/deployed.json`.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **MetaMask** browser extension
- **Mantle Sepolia MNT** (from [faucet](https://faucet.sepolia.mantle.xyz))
- **DeepSeek API key** (from [platform.deepseek.com](https://platform.deepseek.com))
- **Byreal Perps CLI** (optional, for perps trading): `npm install -g @byreal-io/byreal-perps-cli`

### Environment Variables

Copy `.env.example` → `.env`:

```bash
# Required
DEEPSEEK_API_KEY=sk-your-deepseek-key

# Required for on-chain execution
MANTLE_PRIVATE_KEY=your_agent_private_key

# Optional: Pinata for IPFS audit trail
PINATA_JWT=your_pinata_jwt

# Optional: Mantlescan for whale tracking
MANTLESCAN_API_KEY=your_mantlescan_key

# Optional: Groq as fallback LLM
GROQ_API_KEY=your_groq_key

# Network: testnet | mainnet
NETWORK=testnet
```

### Install & Run

```bash
npm install
npm run dev
```

Visit **http://localhost:3000** — you'll see the landing page with links to the Chat and Dashboard.

### Fund the Vault

> [!TIP]
> MetaMask may block sending testnet tokens directly to the AgentVault contract address. If the transaction fails or gets stuck, you can fund the vault from the CLI instead:
>
> ```bash
> npx tsx scripts/send-to-vault.ts
> ```
>
> This script transfers mock tokens (tUSDC, tWETH, etc.) from the agent wallet to the vault using the deployed addresses in `artifacts/deployed.json`.

---

## 🎬 Demo Flow (5 minutes)

### 1. Connect & Fund

```
Open Dashboard → "Connect Wallet" → MetaMask approves
→ Copy the AgentVault address
→ Send 1000 tUSDC from MetaMask to the vault address
→ Dashboard updates: vault balance = $1,000
```

### 2. Chat with Mantis

```
Open Chat → "Mantis, show me my portfolio"
→ Agent calls getPortfolio → returns table of token balances

"What yields are available for USDC?"
→ Agent calls getYields → returns Lendle (6.2%), Merchant Moe LP (8.5%), mETH (3.5%)

"Scan market signals"
→ Agent calls getMarketIntel → returns BTC, ETH, SOL momentum scanner with funding rates
```

### 3. Yield Farming

```
"Deposit 500 USDC into Lendle"
→ Agent calls manageLending → encodes deposit calldata →
   vault.execute(lendlePool, 0, depositData, $500, ipfs://…) →
   on-chain guardrails check → tx confirmed →
   auditor pins rationale to IPFS
→ Explorer link shows AgentExecuted event
```

### 4. Perps Trading

```
"Long BTC with $100 at 2x leverage"
→ Agent calls managePerps → guardrails check →
   "Needs approval: LONG BTC-PERP at 2x, $100"
→ User confirms → agent calls confirmPerpsAction →
   byreal-perps-cli order market long 100 BTC →
   position opened with TP/SL auto-set
```

### 5. Emergency Withdrawal

```
"Withdraw my USDC back to 0x1234…"
→ Agent calls withdrawFunds → returns encoded calldata for MetaMask
→ User opens Dashboard → "Withdraw" tab →
   Signs requestWithdrawal(USDC) in MetaMask →
   1-hour timelock countdown begins →
   After 1 hour: signs executeWithdrawal() →
   All USDC returned to user's wallet
```

---

## 🏆 Hackathon Tracks

### 🥇 Agentic Wallets & Economy (Byreal)

Mantis is a complete agentic wallet implementation:

- **On-chain guardrails**: AgentVault enforces spend limits at the contract level
- **User custody**: The user is the vault owner — they control guardrails and can recover funds
- **Non-custodial by design**: The agent executes but never holds funds directly
- **Programmable execution**: `vault.execute(target, value, data, valueUsd, cid)` is a general-purpose agent execution interface
- **ERC-8004 integration**: On-chain identity, reputation, and validation registries
- **Byreal perps integration**: Real Hyperliquid trading via CLI, not simulation

### 🥈 AI Alpha & Data (Mirana)

Mantis synthesizes multiple data sources into actionable trading decisions:

- **Multi-source alpha**: Byreal market signals + Mantlescan whale tracking + CoinGecko price feeds + DEX analytics
- **Strategy proposals**: AI-generated recommendations with reasoning, risks, and suggested actions
- **Technical analysis**: RSI, MACD, EMA crossover, VWAP, funding rates per coin via Byreal
- **Smart money tracking**: Large transfer detection on Mantle with known wallet labeling
- **Transparent reasoning**: Every trade's rationale is hashed, pinned to IPFS, and verifiable

---

## 📁 Project Structure

```
src/
├── agent/
│   ├── config.ts              # Network config, token/contract addresses, guardrail defaults
│   ├── system-prompt.ts       # Dynamic system prompt (testnet/mainnet aware)
│   ├── guardrails.ts           # 3-layer guardrail engine (hard/soft/circuit-breaker)
│   ├── auditor.ts             # Self-audit: SHA-256 → IPFS (Pinata) → ERC-8004
│   ├── memory.ts              # SQLite-backed conversation memory
│   ├── wallet.ts              # Dual-treasury: Mantle EVM + Byreal Hyperliquid
│   ├── vault.ts               # AgentVault client: execute(), getVaultState(), withdrawal helpers
│   └── tools/
│       ├── analytics.ts       # getPortfolio, compareYields, generateStrategyProposal
│       ├── byreal-perps.ts    # Full Hyperliquid perps CLI wrapper (14 functions)
│       ├── merchant-moe.ts    # DEX swap + encodeSwapData for vault execution
│       ├── lendle.ts          # Lending deposit/withdraw + encode for vault execution
│       ├── smart-money.ts     # Whale transfers, wallet tracking via Mantlescan
│       ├── dex-analytics.ts   # Merchant Moe pool data, price impact, liquidity depth
│       └── erc8004.ts         # Identity NFT, Reputation, Validation registries
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # 14-tool registry, streamText(), guardrail engine
│   │   ├── status/route.ts    # Real-time dashboard data (wallet, vault, positions)
│   │   └── withdraw/route.ts  # Vault withdrawal endpoint
│   ├── chat/page.tsx          # Chat UI with streaming message rendering
│   ├── dashboard/page.tsx     # Dashboard: portfolio, positions, vault, guardrails
│   └── page.tsx               # Landing page
├── components/
│   ├── VaultPanel.tsx         # Vault state: guardrails, daily spend bar, withdrawal countdown
│   ├── DepositWithdraw.tsx    # Deposit to vault, timelocked owner withdrawal
│   ├── GuardrailPanel.tsx     # Guardrail status display
│   ├── KillSwitch.tsx         # Emergency stop button
│   ├── PositionTracker.tsx    # Byreal perps positions table
│   ├── YieldTable.tsx         # Yield comparison across protocols
│   ├── ActivityLog.tsx        # Recent actions with tx links
│   ├── ChatMessage.tsx        # Markdown-rendered chat bubbles
│   ├── WalletConnect.tsx      # MetaMask connect/disconnect
│   └── ...
├── lib/
│   ├── mantle.ts              # viem clients (public + wallet), chain definition
│   ├── contracts.ts           # All ABIs and contract addresses
│   ├── wallet-connect.ts      # Browser-side MetaMask integration
│   ├── db.ts                  # SQLite persistence layer
│   └── types.ts               # Shared TypeScript interfaces
contracts/
├── AgentVault.sol             # On-chain programmable wallet (~310 lines)
└── MockERC20.sol              # Faucet-able test tokens
scripts/
└── deploy.ts                  # Standalone deploy script (solc + viem)
artifacts/
└── deployed.json              # All deployed addresses for reference
```

---

## 🧪 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, CSS custom properties |
| **AI/LLM** | Vercel AI SDK v6, DeepSeek Chat, Groq (fallback) |
| **Smart Contracts** | Solidity 0.8.20, deployed via solc + viem |
| **EVM Client** | viem 2.x (public client + wallet client) |
| **Perps Trading** | `@byreal-io/byreal-perps-cli` v0.3.7 → Hyperliquid |
| **Data Storage** | better-sqlite3 (in-memory + on-disk) |
| **IPFS** | Pinata API (rationale pinning) |
| **On-Chain Identity** | ERC-8004 registries (Identity, Reputation, Validation) |
| **DEX** | Merchant Moe (Uniswap V2 compatible router) |
| **Lending** | Lendle (Aave V2 compatible pool) |
| **Network** | Mantle Sepolia (testnet) / Mantle Mainnet |

---

## 🔮 What's Next

- [ ] **Multichain expansion**: AgentVault on Base, Arbitrum, Optimism
- [ ] **Intent-based execution**: Users specify desired outcomes; the agent figures out the path
- [ ] **Social trading**: Share your agent's strategy, follow top-performing agents
- [ ] **Agent marketplace**: Deploy pre-configured Mantis agents with custom risk profiles
- [ ] **Mobile app**: React Native wallet with built-in agent chat
- [ ] **Backtesting engine**: Test strategies against historical data before deploying capital
- [ ] **Multi-agent coordination**: Multiple Mantis agents collaborating on complex DeFi strategies

---

## 👥 Team

Built with ❤️ for the Turing Test Hackathon 2026.

---

## 📜 License

MIT
