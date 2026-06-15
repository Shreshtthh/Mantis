# Mantis — Deployment & Funding Guide

> TL;DR: $15-25 total. ~2 hours. Every step tested before you send money.

## BIG PICTURE

```
Your exchange wallet (Binance/Bybit)
    │
    ├─→ Mantle mainnet wallet (0x???)
    │       │
    │       ├── $3-5 MNT (gas for deploy + ERC-8004 mint)
    │       └── $5 USDC (optional — DeFi demo)
    │
    └─→ Hyperliquid L1 (0x92CB...)
            │
            └── $10 USDC (perps trading capital)
```

## PHASE 0: PREPARE YOUR WALLETS (No money needed yet)

### Step 0.1: Create a fresh wallet for Mantis (if you don't have one)

```
Option A: Use the existing key that's already in realclaw-config.json
  → Address: 0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6
  → Private key: 0xc167713f0ebf5c80f814357de70896be71657d3770fbea208b1f91615e2ba5f5
  → This wallet is already configured as the Byreal agent wallet
  → Used for: Hyperliquid perps + Mantle gas

Option B: Create a new wallet (more secure, more work)
  → npm install -g @nktkas/hyperliquid (or use MetaMask)
  → Use separate keys for Mantle vs Hyperliquid
```

**RECOMMENDED: Use Option A.** One wallet, both chains. Keep it simple for hackathon.

### Step 0.2: Set env vars in .env NOW (before any money moves)

```bash
# In your .env file, add:

# ── Network ──
NETWORK=mainnet

# ── Byreal (Hyperliquid) ──
BYREAL_PERPS_AGENT_KEY=0xc167713f0ebf5c80f814357de70896be71657d3770fbea208b1f91615e2ba5f5
BYREAL_PERPS_WALLET_ADDRESS=0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6

# ── Mantle ── (same key for hackathon simplicity)
MANTLE_PRIVATE_KEY=0xc167713f0ebf5c80f814357de70896be71657d3770fbea208b1f91615e2ba5f5
```

Verify it works (read-only — no money needed):
```bash
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli account info -o json
# Should show: "accountValue": "0.000000"
```

---

## PHASE 1: FUND HYPERLIQUID ($10)

### What you need
- ~$12-15 USDC on Arbitrum (includes bridge fees)
- MetaMask or any wallet with the USDC

### Step 1.1: Get USDC on Arbitrum

1. Buy USDC on exchange (Binance, Bybit, Coinbase)
2. Withdraw to your existing Arbitrum wallet address
3. Use Arbitrum network (cheap — $0.10 gas)

### Step 1.2: Bridge to Hyperliquid

1. Go to https://app.hyperliquid.xyz/deposit
2. Connect your Arbitrum wallet
3. Enter: **$10 USDC**
4. Destination address: **0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6**
5. Click Deposit
6. Bridge takes 2-5 minutes. Check on app.hyperliquid.xyz/portfolio

**⚠️ IMPORTANT:** Deposit $10 only. NOT more. This is demo capital.

### Step 1.3: Verify it landed

```bash
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli account info -o json
# Should show: "accountValue": "10.000000"
```

---

## PHASE 2: FUND MANTLE ($5)

### What you need
- ~$3-5 MNT for gas
- ~$3-5 USDC on Mantle (optional — only if doing DeFi demo)

### Step 2.1: Get MNT

Same process: buy on exchange → withdraw to **0x92CB...** on Mantle network.
- Withdraw $3-5 MNT (enough for ~100+ transactions)
- Mantle network withdrawal may use Mantle bridge if exchange doesn't support direct MNT withdrawals

### Step 2.2: Get USDC on Mantle (optional)

- Bridge from Arbitrum via https://bridge.mantle.xyz
- Or withdraw directly from exchange to Mantle

### Step 2.3: Verify

```bash
curl -s https://rpc.mantle.xyz \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6","latest"],"id":1}'
# Returns hex balance in wei
```

---

## PHASE 3: FIRST TRADE ($3 ETH LONG WITH STOP-LOSS)

### ⚠️ DO NOT SKIP THIS STEP. Test before any code executes a trade.

```bash
# 1. Check current ETH price
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli signal detail ETH -o json
# Note the current price (e.g., $1,665)

# 2. Calculate stop-loss: price × 0.97 = 3% below
#    If ETH = $1,665 → SL = $1,615

# 3. Open a TINY ETH long with stop-loss
#    Size: $20 (0.012 ETH at $1,665, costs ~$10 margin at 2x)
#    This is the minimum order size. It's safe.
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli order market long 20 ETH --sl 1615 -o json

# 4. Verify position opened
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli position list -o json

# 5. Wait 2 minutes. Then close it.
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli position close-market ETH -o json
```

**Maximum loss on this test:** ~$0.60 (3% of $20 at 2x). You won't lose more because the SL is on-chain.

If this works → CLI auth is confirmed. Trades execute. Continue.

If it fails → DO NOT proceed. Debug the CLI first. Check the error message.

---

## PHASE 4: DEPLOY AGENTVAULT + MINT ERC-8004 ($2-3 gas)

### What this does
- Deploys the AgentVault smart contract to Mantle mainnet
- Mints your ERC-8004 identity NFT
- This IS Track B — on-chain agent identity

### Step 4.1: Deploy AgentVault

```bash
cd /root/metamask-cook-off/TuringTestHackathon

# Check .env has:
# MANTLE_PRIVATE_KEY=0xc167...
# NETWORK=mainnet

npx hardhat run scripts/deploy-agent-vault.ts --network mantle-mainnet
```

After deploy:
1. Copy the deployed contract address
2. Update `src/agent/config.ts`:
   ```typescript
   agentVault: '0x<new-address>' as `0x${string}`,
   ```

### Step 4.2: Pin metadata to IPFS (Pinata)

Go to https://app.pinata.cloud → Upload → JSON. Use this content:

```json
{
  "name": "Mantis",
  "version": "1.0.0",
  "description": "Autonomous AI DeFi agent. Trades perps on Byreal/Hyperliquid and manages DeFi on Mantle through natural language. Every decision permanently audited on-chain via ERC-8004.",
  "capabilities": ["perps", "sentiment", "strategy", "audit", "guardrails"],
  "networks": ["Mantle", "Hyperliquid"],
  "guardrails": {
    "maxLeverage": 2,
    "maxSingleTradeUsd": 20,
    "maxDailyLossUsd": 5,
    "approvedMarkets": ["ETH-PERP"],
    "stopLossRequired": true
  },
  "wallets": {
    "byrealPerps": "0x92CbB44A94BEf56944929e25077F3A4F4F7B95E6"
  }
}
```

After upload, copy the IPFS CID (e.g., `QmXxx...`).

### Step 4.3: Mint ERC-8004 identity

This is a one-time transaction on Mantle mainnet. Costs ~$0.50 in MNT gas.

The easiest way: use the existing code. The contracts.ts already has the ABIs. Run via a simple script or via the web dashboard's admin panel.

Your IPFS CID from Pinata becomes: `ipfs://QmXxx...`

After minting, set in `.env`:
```
AGENT_TOKEN_ID=<the-token-id-you-received>
```

**How to find your identity later:**
1. Go to https://explorer.mantle.xyz
2. Search: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistry)
3. Find your mintIdentity transaction → tokenId
4. Your IPFS metadata: `https://gateway.pinata.cloud/ipfs/QmXxx...`

---

## PHASE 5: DEPLOY THE STATUS API TO RENDER

This gives the RealClaw skill a PUBLIC URL to hit.

### Step 5.1: Push to GitHub

Commit and push everything to your repo.

### Step 5.2: Create Render Web Service

1. Go to https://dashboard.render.com
2. New → Web Service → Connect your GitHub repo
3. Settings:
   - **Name:** mantis-status
   - **Root Directory:** `TuringTestHackathon`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npx tsx src/server/index.ts`
   - **Environment Variables:** (add all from .env — Render dashboard)
   - **Plan:** Free ($0/month)

4. Deploy. Render gives you: `https://mantis-status.onrender.com`

### Step 5.3: Verify

```bash
curl https://mantis-status.onrender.com/api/status
# Should return agent info, guardrails, network
```

### Step 5.4: Update SKILL.md with real URL

Replace `<vps-ip>` with `https://mantis-status.onrender.com` in:
- `~/.openclaw/workspace/skills/mantis/SKILL.md`
- Push to GitHub in a public repo (e.g., `notshreshth/mantis-skill`)

---

## PHASE 6: INSTALL SKILL INTO REALCLAW

On Telegram, tell RealClaw:

```
npx skills add notshreshth/mantis-skill
```

If that doesn't work (beta limitation), manually paste the skill content:

```
/loadskill

(mantis skill body)
```

Test it:
```
User (TG): "What's my Mantis agent status?"
RealClaw: calls GET https://mantis-status.onrender.com/api/status
        → "Your agent Mantis v1.0.0 is online. Network: Mantle mainnet. 
           Wallet: 0x92CB... $10 equity. Guardrails active."
```

---

## PHASE 7: RUN THE AUTONOMOUS LOOP (ON YOUR MACHINE)

### Step 7.1: Dry-run first (NO real trades)

```bash
cd /root/metamask-cook-off/TuringTestHackathon

# Single dry run:
npm run agent-loop

# Or continuous dry run (runs every 10 min):
npm run agent-loop:dry
```

Read the logs in `logs/agent-loop-YYYY-MM-DD.log`. Verify:
- Sentiment data is pulling real prices
- DeepSeek evaluation makes sense
- All decisions say "DRY RUN: Would..." (no real execution)

### Step 7.2: Live run (REAL trades — only after reviewing dry-run logs)

```bash
DRY_RUN=false npm run agent-loop:watch
```

Keep terminal open. Watch for first trade. Be ready to close position via TG if needed.

---

## PHASE 8: DEPLOY WEB APP TO VERCEL

```bash
cd /root/metamask-cook-off/TuringTestHackathon
npx vercel --prod
```

Set environment variables in Vercel dashboard (same as .env minus the BYREAL keys — Vercel can't run CLI).

The web app shows: portfolio, audit trail, sentiment, guardrail dashboard.

---

## EMERGENCY: HOW TO GET YOUR MONEY OUT

### Close all positions
```bash
BYREAL_PERPS_AGENT_KEY="0xc167..." \
BYREAL_PERPS_WALLET_ADDRESS="0x92CB..." \
npx byreal-perps-cli position close-all -y
```

Or via Telegram: "close all positions"

### Bridge back to Arbitrum
1. Go to https://app.hyperliquid.xyz/withdraw
2. Send USDC to your Arbitrum wallet
3. Takes 2-5 minutes

### Mantle funds
Just send USDC/MNT from 0x92CB... back to your exchange wallet via MetaMask.

---

## WHAT CAN GO WRONG (AND WHAT TO DO)

| Problem | Fix |
|---|---|
| CLI says "account not found" | BYREAL_PERPS_AGENT_KEY wrong. Check .env |
| Network error on CLI calls | Hyperliquid API rate limit. Wait 30s. |
| Position won't open | Less than $8 margin. Need ~$10 for ETH min. |
| DeepSeek returns gibberish | Reduce temperature to 0, retry |
| Circuit breaker tripped | Check logs. Reset with killSwitch:disengage |
| Lost SL on position | Set manually: `byreal-perps-cli position tpsl ETH --sl <price>` |
