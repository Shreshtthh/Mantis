# Mantis — Demo Video Script

> Duration: 3 minutes
> Target: Turing Test Hackathon 2026 — Tracks A (DeFi Strategy) + B (RealClaw Expansion)
> Format: Screen recording with voiceover. Cut between TG, web dashboard, and terminal.

---

## SCENE 1: THE PROBLEM (0:00 – 0:25)

**Visual:** Screen shows a cluttered DeFi dashboard. Numbers everywhere.

**Voiceover:**
"DeFi is a mess. You've got tokens on Mantle. Perps on Hyperliquid. Swaps on one DEX. Lending on another. Fourteen different things to check before you make a single trade. Nobody has time for this."

**Visual:** Cut to black. Text fades in: "What if your wallet had a brain?"

**Voiceover:**
"This is Mantis. An AI agent that trades for you. On-chain. Auditable. And it can't go rogue."

---

## SCENE 2: REALCLAW ON TELEGRAM — BYREAL INTEGRATION (0:25 – 1:10)

**Visual:** Open Telegram. Show MantisPincerBot chat. RealClaw status: online.

**Voiceover:**
"Mantis lives on Telegram through RealClaw — Byreal's AI agent platform. It's got its own wallet, its own on-chain identity, and it trades perpetual futures through the Byreal Perps engine. Let me show you."

**Visual:** Type into TG: "Scan the markets. What looks good?"

**Voiceover:**
"I ask it to scan markets. RealClaw's Claude model picks up the Byreal Perps skill — it calls the signal scanner, checks funding rates, RSI, MACD, volume across BTC, ETH, and SOL."

**Visual:** RealClaw responds with market analysis. Show the response.

**Voiceover:**
"ETH shows bearish divergence — funding is positive, RSI is cooling off. The agent gives me a clear read with data, not vibes."

**Visual:** Type: "Short ETH $5 with 2x and 3% stop-loss"

**Voiceover:**
"I tell it to execute. It calls the Byreal Perps CLI — market order, 2x leverage, stop-loss attached."

**Visual:** RealClaw confirms: "Done. Position 0.003 ETH short at $1,665. SL at $1,715. View: app.hyperliquid.xyz/trade/ETH"

**Voiceover:**
"No wallet hunting. No gas math. No exchange tabs. I just said what I wanted and the agent did it. This is what Byreal + RealClaw enables — AI-native trading through chat."

**Visual:** Show the position on Hyperliquid explorer. Real money, real position.

**Voiceover:**
"This trade is live on Hyperliquid mainnet. Real money. Real execution. But here's the thing — RealClaw is great when I'm chatting. What about when I'm asleep?"

---

## SCENE 3: THE AUTONOMOUS AGENT LOOP (1:10 – 1:45)

**Visual:** Switch to terminal. Show `agent-loop.ts` running with logs scrolling.

**Voiceover:**
"That's where the autonomous agent loop comes in. Every 10 minutes, it wakes up, pulls market data from four free sources, asks the LLM to evaluate, and decides whether to trade — all without me touching anything."

**Visual:** Walk through the terminal output:

```
══════════════════════════════════════
  Mantis Autonomous Agent Loop
  Dry run: NO | Coins: ETH
  Leverage: 2x | Max position: $5
  Min confidence: 75%
══════════════════════════════════════
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cycle start (LIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wallet: $8.42 equity
--- ETH ---
  Sentiment: bullish (score 68, conf 42%)
  Confidence 42% < 75% threshold — skipping
Cycle done.
```

**Voiceover:**
"It pulls Fear & Greed from Alternative.me. Price action from CoinGecko. News headlines from CryptoPanic. Funding rates from Hyperliquid. Feeds it all to DeepSeek. If confidence crosses 75%, it opens a trade with a stop-loss. If it loses 3 in a row, it pauses itself. Three dollar max loss per day. I set these limits. The code enforces them."

**Visual:** Show the circuit breaker state in a later cycle where it triggers.

**Voiceover:**
"This isn't a bot that YOLOs your wallet. Every trade is small, every trade has a stop-loss, and the circuit breakers are in the code — not in a config file you hope someone read."

---

## SCENE 4: ON-CHAIN AUDIT TRAIL — MANTLE + ERC-8004 (1:45 – 2:20)

**Visual:** Switch to Mantis web dashboard. Show the audit trail page.

**Voiceover:**
"But the real question is: how do you trust an AI with your money? The answer is on-chain audit. Every decision Mantis makes gets permanently recorded."

**Visual:** Show Mantle explorer — ERC-8004 Identity Registry.

**Voiceover:**
"Mantis has its own ERC-8004 identity on Mantle. It's an NFT that says 'this is an AI agent, and here's what it's authorized to do.' Every trade gets written to the Validation Registry with an IPFS link containing the full reasoning."

**Visual:** Click through to an IPFS entry. Show the rationale: "Opened ETH short at $1,665 because funding rate was 0.0015% (bearish), RSI 51 (neutral-cooling), Fear & Greed at 72 (greed — contrarian short signal). Max loss: $0.45 at 3% SL."

**Voiceover:**
"This is the difference between a black box and an auditable agent. You can verify WHY it traded, WHEN it traded, and whether it followed its own rules. You audit Mantis the same way you audit a human trader — by looking at the decisions."

---

## SCENE 5: GUARDRAILS + TRACK B CROSSOVER (2:20 – 2:45)

**Visual:** Pull up the Mantis SKILL.md file side by side with RealClaw TG.

**Voiceover:**
"Mantis extends RealClaw through a custom skill. This is Track B — RealClaw Expansion. The skill teaches RealClaw about Mantle: how to query our API, check vault state, and verify the audit trail. RealClaw on TG handles the Byreal trading. Our web app handles Mantle DeFi — swaps, lending, yield. Same agent, two surfaces, one identity."

**Visual:** Show the routing table from the system prompt.

**Voiceover:**
"And the agent never confuses the two. Say 'swap' — it goes to Mantle. Say 'long ETH' — it goes to Byreal. The system prompt has an explicit routing table. No ambiguity, no guessing."

**Visual:** Show the guardrail dashboard.

**Voiceover:**
"All of this is wrapped in guardrails. Five dollar max per trade. Three trades per day. Two-x max leverage. If the agent loses three in a row, it pauses itself. These limits are in the code — not configurable through chat. You can't sweet-talk the agent into betting the house."

---

## SCENE 6: CLOSE — THE PITCH (2:45 – 3:00)

**Visual:** Montage — TG trade → terminal loop → on-chain audit → guardrail dashboard. End on Mantis logo.

**Voiceover:**
"Mantis is what DeFi should be. An agent that trades for you — through natural language on Telegram, autonomously when you're away, with every decision permanently audited on-chain. Built on Byreal for execution. Built on Mantle for trust."

**Visual:** Text fades in:

```
Mantis
Autonomous DeFi Agent
Byreal Perps × Mantle × ERC-8004

github.com/notshreshth/mantis
```

**Voiceover:**
"Two tracks. One agent. Zero trust required."

---

## RECORDING CHECKLIST

### Before recording:
- [ ] Fund Hyperliquid wallet with $5-10 USDC
- [ ] Test a real trade via CLI (`byreal-perps-cli order market long 5 ETH --sl <price> -o json`)
- [ ] Confirm RealClaw is online and responsive on TG
- [ ] Clean terminal history, close unrelated tabs, dark mode everything
- [ ] Pre-open: TG, terminal (agent loop ready to run), web dashboard, Mantle explorer
- [ ] Add BYREAL env vars to `.env` so agent loop reads balance correctly

### Scene transitions:
- Scene 1→2: Cut from black screen to Telegram
- Scene 2→3: Cut from TG to terminal
- Scene 3→4: Cut from terminal to web dashboard → Mantle explorer
- Scene 4→5: Split screen: SKILL.md + TG
- Scene 5→6: Montage, end on logo

### Audio notes:
- Clear, unhurried pace. Pause after each demo action.
- No background music (or very subtle, no vocals)
- If on-camera: no. Screen recording only with voiceover.

### One-sentence pitch (for DoraHacks submission):
"Mantis is an autonomous DeFi agent that trades on Byreal Perps and manages yield on Mantle, with every decision permanently audited on-chain through ERC-8004."

### Hackathon alignment:
- **Track A (DeFi Strategy):** Multi-source sentiment → LLM evaluation → automated Perps execution with stop-losses and circuit breakers
- **Track B (RealClaw Expansion):** Custom SKILL.md bridges RealClaw to Mantle DeFi, extending the platform's reach to a new chain
- **ERC-8004:** Identity NFT + Validation Registry + IPFS audit trail for every trade
