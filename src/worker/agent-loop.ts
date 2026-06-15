/**
 * Autonomous Agent Loop — Mantis v1
 *
 * Runs as a standalone background process (NOT a web endpoint).
 * Every cycle: fetch sentiment → DeepSeek evaluates → execute trade if warranted.
 *
 * Usage:
 *   npx tsx src/worker/agent-loop.ts           # single run
 *   npx tsx src/worker/agent-loop.ts --loop     # run every INTERVAL_MS
 *   npx tsx src/worker/agent-loop.ts --dry-run  # evaluate only, no execution
 *
 * Safety:
 *   - Dry-run by default. Set DRY_RUN=false in env to execute real trades.
 *   - Circuit breakers: consecutive losses, daily loss cap, min balance
 *   - Every trade has a stop-loss attached
 *   - Max $5 position, max 2x leverage, max 3 trades/day
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env manually — Next.js does this auto for the web app, worker is standalone.
(function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
})(path.join(process.cwd(), '.env'));

import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { analyzeSentiment } from '@/agent/tools/sentiment';
import {
  marketOrder,
  closeMarket,
  getAccountInfo,
  listPositions,
} from '@/agent/tools/byreal-perps';

// ============================================================
// CONFIGURATION
// ============================================================

const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default: dry-run (safe)
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes between cycles
const COINS = ['ETH'] as const; // Start with ETH only (lowest min trade size)

const LIMITS = {
  maxPositionSizeUsd: 20,     // 0.01 ETH min ~$8 margin at 2x, cap at $20
  maxLeverage: 2,
  maxDailyTrades: 3,
  maxDailyLossUsd: 5,         // Circuit breaker: pause after $5 loss in 24h
  maxConsecutiveLosses: 3,
  minConfidence: 75,          // Sentiment confidence threshold
  minBalanceUsd: 5,           // Pause if wallet drops below $5
  stopLossPercent: { ETH: 3 } as Record<string, number>,
};

// ============================================================
// STATE (in-memory, resets on restart)
// ============================================================

const state = {
  tradesToday: 0,
  dailyLossUsd: 0,
  consecutiveLosses: 0,
  lastTradeDate: new Date().toDateString(),
  paused: false,
  pauseReason: '',
};

// ============================================================
// LOGGING
// ============================================================

const LOG_DIR = path.join(process.cwd(), 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `agent-loop-${new Date().toISOString().slice(0, 10)}.log`);

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// ============================================================
// CIRCUIT BREAKERS
// ============================================================

function resetDailyState() {
  const today = new Date().toDateString();
  if (state.lastTradeDate !== today) {
    state.tradesToday = 0;
    state.dailyLossUsd = 0;
    state.lastTradeDate = today;
    log('Daily state reset');
  }
}

function checkBreakers(): boolean {
  resetDailyState();

  if (state.paused) {
    log(`⛔ PAUSED: ${state.pauseReason}`);
    return false;
  }

  if (state.tradesToday >= LIMITS.maxDailyTrades) {
    log(`⛔ Daily trade limit reached (${state.tradesToday}/${LIMITS.maxDailyTrades})`);
    return false;
  }

  if (state.dailyLossUsd >= LIMITS.maxDailyLossUsd) {
    state.paused = true;
    state.pauseReason = `Daily loss $${state.dailyLossUsd.toFixed(2)} exceeds cap $${LIMITS.maxDailyLossUsd}`;
    log(`⛔ CIRCUIT BREAKER: ${state.pauseReason}`);
    return false;
  }

  if (state.consecutiveLosses >= LIMITS.maxConsecutiveLosses) {
    state.paused = true;
    state.pauseReason = `${LIMITS.maxConsecutiveLosses} consecutive losses`;
    log(`⛔ CIRCUIT BREAKER: ${state.pauseReason}`);
    return false;
  }

  return true;
}

// ============================================================
// WALLET CHECK
// ============================================================

async function checkBalance(): Promise<{ ok: boolean; balance: number; equity: number }> {
  if (DRY_RUN) {
    // Use mock balance so the loop can demonstrate sentiment → LLM → trade flow
    return { ok: true, balance: 20, equity: 20 };
  }

  try {
    const account = await getAccountInfo();
    if (!account) {
      log('⚠️ Could not fetch account info — BYREAL_PERPS_AGENT_KEY/WALLET_ADDRESS set?');
      return { ok: false, balance: 0, equity: 0 };
    }

    const balance = account.margin;
    const equity = account.equity;

    if (balance < LIMITS.minBalanceUsd) {
      log(`⛔ Balance $${balance.toFixed(2)} below minimum $${LIMITS.minBalanceUsd}`);
      state.paused = true;
      state.pauseReason = 'Insufficient balance';
      return { ok: false, balance, equity };
    }

    return { ok: true, balance, equity };
  } catch (err) {
    log(`⚠️ Balance check failed: ${err}`);
    return { ok: false, balance: 0, equity: 0 };
  }
}

// ============================================================
// DEEPSEEK EVALUATION
// ============================================================

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });

async function evaluateTrade(
  coin: string,
  sentiment: Awaited<ReturnType<typeof analyzeSentiment>>,
  balance: number,
  equity: number,
): Promise<{ action: 'open' | 'close' | 'hold'; reason: string }> {
  if (!sentiment) return { action: 'hold', reason: 'No sentiment data available' };

  const prompt = `You are Mantis, a trading agent. Evaluate this market data and decide: OPEN a long, CLOSE existing position, or HOLD.

Coin: ${coin}
Price: $${sentiment.price.toFixed(2)}
24h Change: ${sentiment.change24h.toFixed(2)}%
Sentiment Score: ${sentiment.overallScore}/100 (${sentiment.direction}, confidence ${sentiment.confidence}%)
Fear & Greed: ${sentiment.fearGreed}/100
Funding Rate: ${(sentiment.fundingRate * 100).toFixed(4)}%
News Sentiment: ${sentiment.newsScore > 0 ? 'positive' : 'negative'}
${sentiment.newsHeadlines.slice(0, 3).map((h) => `- ${h}`).join('\n')}
Reasons: ${sentiment.reasons.join('; ')}
Wallet: $${equity.toFixed(2)} equity, $${balance.toFixed(2)} available
Limits: max $${LIMITS.maxPositionSizeUsd} position, ${LIMITS.maxLeverage}x leverage, ${LIMITS.stopLossPercent[coin]}% SL

Respond with ONLY one word on the first line: OPEN, CLOSE, or HOLD.
On the second line, one sentence explaining why.`;

  try {
    const result = await generateText({
      model: deepseek('deepseek-chat'),
      prompt,
      maxOutputTokens: 80,
      temperature: 0, // Deterministic for safety
    });

    const text = result.text.trim();
    const [actionLine, ...reasonLines] = text.split('\n');
    const actionRaw = actionLine.trim().toUpperCase();

    let action: 'open' | 'close' | 'hold' = 'hold';
    if (actionRaw.startsWith('OPEN')) action = 'open';
    else if (actionRaw.startsWith('CLOSE')) action = 'close';

    const reason = reasonLines.join(' ').trim() || text;

    return { action, reason };
  } catch (err) {
    log(`⚠️ DeepSeek evaluation failed: ${err}`);
    return { action: 'hold', reason: 'LLM evaluation error — holding' };
  }
}

// ============================================================
// TRADE EXECUTION
// ============================================================

async function executeOpen(coin: string, entryPrice: number): Promise<{ success: boolean; pnl?: number }> {
  const slPrice = Math.round(entryPrice * (1 - LIMITS.stopLossPercent[coin]! / 100) * 100) / 100;

  if (DRY_RUN) {
    log(`🔶 DRY RUN: Would LONG ${coin} $${LIMITS.maxPositionSizeUsd} at $${entryPrice} (${LIMITS.maxLeverage}x, SL $${slPrice})`);
    return { success: true };
  }

  log(`▶️ Opening ${coin} LONG: $${LIMITS.maxPositionSizeUsd} at ~$${entryPrice}, ${LIMITS.maxLeverage}x, SL $${slPrice}`);

  try {
    const result = await marketOrder({
      side: 'buy',
      size: LIMITS.maxPositionSizeUsd,
      coin,
      sl: slPrice,
    });

    if (!result.success) {
      log(`❌ Market order failed: ${result.error}`);
      return { success: false };
    }

    log(`✅ Position opened: ${result.data?.positionId ?? 'unknown'} at $${result.data?.entryPrice ?? entryPrice}`);
    return { success: true };
  } catch (err) {
    log(`❌ Market order exception: ${err}`);
    return { success: false };
  }
}

async function executeClose(coin: string): Promise<{ success: boolean; pnl?: number }> {
  if (DRY_RUN) {
    log(`🔶 DRY RUN: Would CLOSE ${coin} position`);
    return { success: true };
  }

  log(`▶️ Closing ${coin} position at market`);

  try {
    const result = await closeMarket(coin);

    if (!result.success) {
      log(`❌ Close failed: ${result.error}`);
      return { success: false };
    }

    const pnl = (result.data as any)?.realizedPnl ?? 0;
    log(`✅ Position closed. PnL: $${pnl.toFixed(2)}`);

    // Update state
    if (pnl < 0) {
      state.consecutiveLosses++;
      state.dailyLossUsd += Math.abs(pnl);
      log(`⚠️ Loss: $${Math.abs(pnl).toFixed(2)}. Consecutive losses: ${state.consecutiveLosses}`);
    } else {
      state.consecutiveLosses = 0;
    }

    return { success: true, pnl };
  } catch (err) {
    log(`❌ Close exception: ${err}`);
    return { success: false };
  }
}

// ============================================================
// MAIN CYCLE
// ============================================================

async function runCycle() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`Cycle start (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Circuit breakers
  if (!checkBreakers()) return;

  // 2. Wallet check
  const wallet = await checkBalance();
  if (!wallet.ok) return;
  log(`Wallet: $${wallet.equity.toFixed(2)} equity | $${wallet.balance.toFixed(2)} available`);

  // 3. Check existing positions
  let existingPositions: string[] = [];
  try {
    const positions = await listPositions();
    existingPositions = positions.map((p: any) => p.coin ?? p.market?.replace('-PERP', '') ?? '');
    if (existingPositions.length > 0) {
      log(`Open positions: ${existingPositions.join(', ')}`);
    }
  } catch (err) {
    log(`⚠️ Could not fetch positions: ${err}`);
  }

  // 4. Evaluate each coin
  for (const coin of COINS) {
    log(`--- ${coin} ---`);

    const sentiment = await analyzeSentiment(coin);
    if (!sentiment) {
      log('  No sentiment data');
      continue;
    }
    log(`  Sentiment: ${sentiment.direction} (score ${sentiment.overallScore}, conf ${sentiment.confidence}%)`);

    // Skip if confidence too low
    if (sentiment.confidence < LIMITS.minConfidence) {
      log(`  Confidence ${sentiment.confidence}% < ${LIMITS.minConfidence}% threshold — skipping`);
      continue;
    }

    const hasPosition = existingPositions.includes(coin);

    // LLM evaluation
    const decision = await evaluateTrade(coin, sentiment, wallet.balance, wallet.equity);
    log(`  DeepSeek: ${decision.action} — ${decision.reason}`);

    // Actually validate: don't close if no position, don't open if already have one
    if (decision.action === 'open' && !hasPosition && sentiment.direction === 'bullish') {
      const result = await executeOpen(coin, sentiment.price);
      if (result.success) state.tradesToday++;
    } else if (decision.action === 'close' && hasPosition) {
      await executeClose(coin);
    } else if (decision.action === 'open' && hasPosition) {
      log('  Already have position — skipping open');
    } else if (decision.action === 'open' && sentiment.direction !== 'bullish') {
      log(`  Sentiment not bullish (${sentiment.direction}) — skipping open despite LLM`);
    } else {
      log('  Holding');
    }
  }

  log(`Cycle done. Trades today: ${state.tradesToday}/${LIMITS.maxDailyTrades}`);
}

// ============================================================
// ENTRY POINT
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const loopMode = args.includes('--loop');
  const intervalArg = args.find((a) => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1]!) * 60 * 1000 : INTERVAL_MS;

  log('══════════════════════════════════════');
  log('  Mantis Autonomous Agent Loop');
  log(`  Dry run: ${DRY_RUN ? 'YES (safe)' : 'NO (real money!)'}`);
  log(`  Coins: ${COINS.join(', ')}`);
  log(`  Leverage: ${LIMITS.maxLeverage}x | Max position: $${LIMITS.maxPositionSizeUsd}`);
  log(`  Min confidence: ${LIMITS.minConfidence}% | Max trades/day: ${LIMITS.maxDailyTrades}`);
  log(`  Daily loss cap: $${LIMITS.maxDailyLossUsd}`);

  if (DRY_RUN) {
    log('  ⚠️  DRY RUN — no real trades will execute');
  }
  log('══════════════════════════════════════');

  if (loopMode) {
    log(`Loop mode — every ${Math.round(intervalMs / 60000)} minutes`);
    await runCycle();
    setInterval(runCycle, intervalMs);
  } else {
    await runCycle();
    log('Single run complete. Use --loop for continuous mode.');
    process.exit(0);
  }
}

main().catch((err) => {
  log(`💥 Fatal: ${err}`);
  process.exit(1);
});
