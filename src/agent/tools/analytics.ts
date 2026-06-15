/**
 * Analytics & Portfolio Tools (v2)
 *
 * Functions:
 * - compareYields(token)          — cross-protocol yield comparison table
 * - getPortfolio()                — combined Mantle + Byreal positions + P&L
 * - analyzeWallet(address)        — wallet history narrative
 * - getPnLSummary()               — P&L breakdown
 * - generateStrategyProposal()    — AI-synthesized strategy recommendation (NEW v2)
 */

import { getLendingRates } from './lendle';
import { getSwapQuote } from './merchant-moe';
import { getAccountInfo, getAllPositions, scanSignals } from './byreal-perps';
import { scanSentiment } from './sentiment';
import { getMantleBalance, getTokenPrices } from '@/agent/wallet';
import { getUserPositions } from './lendle';
import { getAgentAddress } from '@/lib/mantle';
import { getWhaleTransfers } from './smart-money';
import type { YieldData, Portfolio, LendlePosition, PerpsPosition, StrategyProposal } from '@/lib/types';

// ============================================================
// YIELD COMPARISON
// ============================================================

export async function compareYields(token: string): Promise<YieldData[]> {
  const yields: YieldData[] = [];

  // Lendle rates (real on mainnet, simulated on testnet)
  try {
    const lendle = await getLendingRates(token);
    yields.push({
      protocol: 'Lendle',
      token,
      supplyApy: lendle.supplyApy,
      borrowApy: lendle.borrowApy,
      utilization: lendle.utilization,
      source: 'lendle',
    });
  } catch {
    // Protocol unavailable
  }

  // mETH staking yield (static from protocol docs — ~3.5% APR)
  if (token === 'mETH' || token === 'WETH' || token === 'ETH') {
    yields.push({
      protocol: 'mETH Protocol (staking)',
      token: 'mETH',
      supplyApy: 3.5,
      tvlUsd: 180_000_000,
      source: 'external',
    });
  }

  // Merchant Moe LP yield (estimated from typical MNT/USDC LP returns)
  if (['USDC', 'MNT', 'USDT', 'WETH'].includes(token)) {
    const lpApyEstimates: Record<string, number> = {
      USDC: 8.5,
      MNT: 12.0,
      USDT: 7.8,
      WETH: 6.2,
    };
    yields.push({
      protocol: 'Merchant Moe (LP)',
      token,
      supplyApy: lpApyEstimates[token] ?? 5.0,
      source: 'external',
    });
  }

  // Sort by APY descending
  yields.sort((a, b) => b.supplyApy - a.supplyApy);

  return yields;
}

// ============================================================
// FULL PORTFOLIO
// ============================================================

export async function getPortfolio(): Promise<Portfolio> {
  const agentAddress = getAgentAddress();

  const [mantleWallet, lendlePositions, perpsPositions, byRealAccount] = await Promise.allSettled([
    getMantleBalance(),
    getUserPositions(agentAddress),
    getAllPositions(),
    getAccountInfo(),
  ]);

  const mantleData = mantleWallet.status === 'fulfilled' ? mantleWallet.value : {
    address: agentAddress,
    tokens: [],
    totalValueUsd: 0,
    nativeBalance: 0n,
  };

  const lendle = lendlePositions.status === 'fulfilled' ? lendlePositions.value : [];
  const perps = perpsPositions.status === 'fulfilled' ? perpsPositions.value : [];
  const byreal = byRealAccount.status === 'fulfilled' ? byRealAccount.value : null;

  // Calculate total portfolio value
  const lendleValueUsd = lendle.reduce((sum: number, p: LendlePosition) => sum + p.valueUsd, 0);
  const perpsValueUsd = perps.reduce((sum: number, p: PerpsPosition) => sum + p.sizeUsd, 0);
  const perpsPnlUsd = perps.reduce((sum: number, p: PerpsPosition) => sum + p.unrealizedPnlUsd, 0);
  const byRealTotalUsd = byreal?.equity ?? 0;

  const totalValueUsd = mantleData.totalValueUsd + lendleValueUsd + byRealTotalUsd;
  const totalPnlUsd = perpsPnlUsd + (byreal?.unrealizedPnl ?? 0);

  return {
    wallet: {
      mantleTreasury: mantleData,
      byrealAccount: byreal
        ? {
            address: byreal.address,
            margin: byreal.margin,
            equity: byreal.equity,
            unrealizedPnl: byreal.unrealizedPnl,
            leverage: byreal.leverage,
          }
        : undefined,
    },
    lendlePositions: lendle,
    perpsPositions: perps,
    totalValueUsd,
    totalPnlUsd,
  };
}

// ============================================================
// WALLET ANALYSIS NARRATIVE
// ============================================================

export async function analyzeWallet(address: `0x${string}`): Promise<{
  summary: string;
  totalValueUsd: number;
  topHolding: string;
  riskLevel: 'low' | 'medium' | 'high';
}> {
  const [mantleBalance, prices] = await Promise.all([
    getMantleBalance().catch(() => null),
    getTokenPrices(['MNT', 'USDC', 'mETH', 'WETH', 'USDT']),
  ]);

  if (!mantleBalance) {
    return {
      summary: 'Unable to fetch wallet data.',
      totalValueUsd: 0,
      topHolding: 'unknown',
      riskLevel: 'low',
    };
  }

  const sortedTokens = [...mantleBalance.tokens].sort((a, b) => b.valueUsd - a.valueUsd);
  const topHolding = sortedTokens[0]?.symbol ?? 'empty';
  const totalValue = mantleBalance.totalValueUsd;

  // Simple risk scoring based on portfolio composition
  const stableValueUsd = mantleBalance.tokens
    .filter((t) => ['USDC', 'USDT'].includes(t.symbol))
    .reduce((sum, t) => sum + t.valueUsd, 0);

  const stablePct = totalValue > 0 ? (stableValueUsd / totalValue) * 100 : 100;
  const riskLevel: 'low' | 'medium' | 'high' =
    stablePct > 60 ? 'low' : stablePct > 30 ? 'medium' : 'high';

  const topTokens = sortedTokens
    .slice(0, 3)
    .map((t) => `${t.symbol} ($${t.valueUsd.toFixed(2)})`)
    .join(', ');

  return {
    summary: `Wallet holds $${totalValue.toFixed(2)} across ${sortedTokens.filter((t) => t.balanceFormatted > 0).length} tokens. Top holdings: ${topTokens}. ${stablePct.toFixed(0)}% in stablecoins.`,
    totalValueUsd: totalValue,
    topHolding,
    riskLevel,
  };
}

// ============================================================
// P&L SUMMARY
// ============================================================

export async function getPnLSummary(): Promise<{
  unrealizedPnlUsd: number;
  perpsPositions: number;
  lendingYieldUsd: number;
  breakdown: Array<{ source: string; pnlUsd: number }>;
}> {
  const [perps, byRealAccount] = await Promise.allSettled([
    getAllPositions(),
    getAccountInfo(),
  ]);

  const perpsData = perps.status === 'fulfilled' ? perps.value : [];
  const byreal = byRealAccount.status === 'fulfilled' ? byRealAccount.value : null;

  const perpsPnl = perpsData.reduce((sum: number, p: PerpsPosition) => sum + p.unrealizedPnlUsd, 0);
  const byRealPnl = byreal?.unrealizedPnl ?? 0;

  const breakdown = [];
  if (perpsData.length > 0) {
    breakdown.push({ source: 'Byreal Perps (unrealized)', pnlUsd: perpsPnl });
  }
  if (byRealPnl !== perpsPnl && byreal) {
    breakdown.push({ source: 'Byreal Portfolio', pnlUsd: byRealPnl });
  }

  return {
    unrealizedPnlUsd: perpsPnl,
    perpsPositions: perpsData.length,
    lendingYieldUsd: 0, // Lending yield accrues in aToken balance, not as explicit P&L
    breakdown,
  };
}

// ============================================================
// STRATEGY PROPOSAL (v2 — Alpha Track)
// ============================================================

/**
 * Generate an AI-synthesized strategy recommendation.
 * Reads current portfolio, market signals, whale activity, and yields
 * to produce a structured proposal with reasoning.
 */
export async function generateStrategyProposal(): Promise<StrategyProposal> {
  // Gather data from all sources in parallel
  const [signalsResult, sentimentResult, whalesResult, yieldsResult, portfolioResult] = await Promise.allSettled([
    scanSignals(),
    scanSentiment(),
    getWhaleTransfers('0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF', 10_000), // USDC on Mantle
    compareYields('USDC'),
    getPortfolio(),
  ]);

  const signals = signalsResult.status === 'fulfilled' ? signalsResult.value : [];
  const sentimentData = sentimentResult.status === 'fulfilled' ? sentimentResult.value : [];
  const whales = whalesResult.status === 'fulfilled' ? whalesResult.value : [];
  const yields = yieldsResult.status === 'fulfilled' ? yieldsResult.value : [];
  const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;

  // Analyze signals
  const bullishSignals = signals.filter(s => s.signal === 'bullish');
  const bearishSignals = signals.filter(s => s.signal === 'bearish');

  // Determine overall signal
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (bullishSignals.length > bearishSignals.length) {
    signal = 'bullish';
  } else if (bearishSignals.length > bullishSignals.length) {
    signal = 'bearish';
  } else {
    signal = 'neutral';
  }

  // Determine confidence
  const strongSignals = signals.filter(s => s.strength > 60).length;
  const confidence: 'high' | 'medium' | 'low' =
    strongSignals >= 2 ? 'high' : strongSignals >= 1 ? 'medium' : 'low';

  // Build reasoning
  const reasoning: string[] = [];
  const risks: string[] = [];

  // Signal reasoning
  if (bullishSignals.length > 0) {
    const topBull = bullishSignals.sort((a, b) => b.strength - a.strength)[0];
    reasoning.push(`${topBull.coin} showing bullish momentum (strength ${topBull.strength}/100, 24h change +${topBull.priceChange24h.toFixed(1)}%)`);
  }

  // Sentiment data (Fear & Greed + news)
  if (sentimentData.length > 0) {
    const bullishSentiment = sentimentData.filter(s => s.direction === 'bullish');
    const fgValue = sentimentData[0]?.fearGreed ?? 50;
    if (fgValue >= 70) reasoning.push(`Fear & Greed Index at ${fgValue} — market greed, consider caution`);
    else if (fgValue <= 30) reasoning.push(`Fear & Greed Index at ${fgValue} — market fear, potential buying opportunity`);
    if (bullishSentiment.length > 0) {
      reasoning.push(`Sentiment bullish on ${bullishSentiment.map(s => s.coin).join(', ')} (confidence: ${bullishSentiment.map(s => s.confidence).join(', ')}%)`);
    }
  }

  // Funding rate reasoning
  const negFunding = signals.filter(s => s.fundingRate < 0);
  if (negFunding.length > 0) {
    reasoning.push(`Negative funding on ${negFunding.map(s => s.coin).join(', ')} — shorts paying longs`);
  }

  // Whale activity
  if (whales.length > 0) {
    const totalWhaleUsd = whales.reduce((sum, w) => sum + w.valueUsd, 0);
    reasoning.push(`$${(totalWhaleUsd / 1_000_000).toFixed(1)}M in whale transfers detected on Mantle (last 24h)`);
  }

  // Yield reasoning
  if (yields.length > 0) {
    const bestYield = yields[0];
    reasoning.push(`Best yield: ${bestYield.protocol} at ${bestYield.supplyApy.toFixed(1)}% APY for ${bestYield.token}`);
  }

  // Risk assessment
  risks.push('Market can reverse quickly — always use stop-losses');
  if (signal === 'bullish') {
    risks.push('Positive sentiment can lead to overleveraged positions market-wide');
  }
  risks.push(`Max loss with 2x leverage at SL: ~$${((portfolio?.totalValueUsd ?? 100) * 0.1).toFixed(0)}`);

  // Build proposal text
  let proposal: string;
  let suggestedAction: StrategyProposal['suggestedAction'];

  if (signal === 'bullish' && confidence !== 'low') {
    const topCoin = bullishSignals[0]?.coin ?? 'BTC';
    proposal = `${topCoin} momentum is strong with negative funding — recommend 2x long $100 to capture funding income and price appreciation.`;
    suggestedAction = {
      tool: 'managePerps',
      params: {
        action: 'market_buy',
        coin: topCoin,
        size: 100,
        leverage: 2,
        tp: undefined,
        sl: undefined,
      },
    };
  } else if (signal === 'bearish') {
    proposal = 'Bearish signals across markets. Recommend parking funds in Lendle USDC lending to earn yield while waiting for better entries.';
    suggestedAction = {
      tool: 'manageLending',
      params: { action: 'deposit', token: 'USDC', amount: 100 },
    };
  } else {
    proposal = 'Mixed signals. Consider splitting: 50% in Lendle USDC (safe yield) and keeping 50% dry powder for a clear directional signal.';
    suggestedAction = {
      tool: 'manageLending',
      params: { action: 'deposit', token: 'USDC', amount: 50 },
    };
  }

  return {
    signal,
    confidence,
    proposal,
    reasoning,
    risks,
    suggestedAction,
    timestamp: new Date().toISOString(),
  };
}
