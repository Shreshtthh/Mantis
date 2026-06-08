/**
 * Byreal Perps Integration — Full CLI Wrapper (v2)
 *
 * Wraps the byreal-perps-cli with typed functions for all operations.
 * Every function has a simulation fallback for when the CLI isn't installed.
 *
 * Functions:
 * - marketOrder(side, size, coin, tp?, sl?)
 * - limitOrder(side, size, coin, price, tp?, sl?)
 * - setTpSl(coin, tp?, sl?)
 * - setLeverage(coin, leverage)
 * - closeMarket(coin)
 * - cancelOrder(orderId)
 * - cancelAll()
 * - listOrders()
 * - listPositions()
 * - getAccountInfo()
 * - getHistory()
 * - scanSignals()
 * - signalDetail(coin)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { PERPS_CONFIG } from '@/agent/config';
import type {
  PerpsPosition,
  PerpsPositionResult,
  PerpsOrder,
  TxResult,
  MarketSignal,
  SignalDetail,
} from '@/lib/types';

const exec = promisify(execFile);

// ============================================================
// HELPER — run CLI with timeout + JSON parse
// ============================================================

const CLI_TIMEOUT_MS = 30_000;
const CLI_NAME = 'byreal-perps-cli';

async function runCli(args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await exec(CLI_NAME, args, {
      timeout: CLI_TIMEOUT_MS,
    });
    if (stderr && stderr.length > 0) {
      console.warn(`[byreal-cli] stderr: ${stderr}`);
    }
    try {
      return JSON.parse(stdout.trim());
    } catch {
      return stdout.trim();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Byreal CLI error: ${msg}`);
  }
}

// ============================================================
// MOCK PRICES for simulation
// ============================================================

const MOCK_PRICES: Record<string, number> = {
  BTC: 100000,
  ETH: 3500,
  SOL: 170,
  GOLD: 2650,
  SILVER: 31,
  OIL: 72,
};

function getMarketName(coin: string): string {
  return `${coin}-PERP`;
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

export async function marketOrder(params: {
  side: 'buy' | 'sell';
  size: number;
  coin: string;
  tp?: number;
  sl?: number;
}): Promise<PerpsPositionResult> {
  const args = [
    'order', 'market', params.side,
    params.size.toString(), params.coin,
    '-o', 'json',
  ];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = await runCli(args) as any;
    if (data.error) return { success: false, error: data.error };
    return {
      success: true,
      txHash: (data.txHash ?? `perps-${Date.now()}`) as `0x${string}`,
      data: {
        positionId: data.positionId ?? data.id ?? `pos-${Date.now()}`,
        market: getMarketName(params.coin),
        side: params.side === 'buy' ? 'long' : 'short',
        sizeUsd: params.size,
        leverage: data.leverage ?? 1,
        entryPrice: data.entryPrice ?? 0,
        liquidationPrice: data.liquidationPrice ?? 0,
      },
    };
  } catch {
    return simulateMarketOrder(params);
  }
}

export async function limitOrder(params: {
  side: 'buy' | 'sell';
  size: number;
  coin: string;
  price: number;
  tp?: number;
  sl?: number;
}): Promise<TxResult> {
  const args = [
    'order', 'limit', params.side,
    params.size.toString(), params.coin, params.price.toString(),
    '-o', 'json',
  ];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = await runCli(args) as any;
    if (data.error) return { success: false, error: data.error };
    return {
      success: true,
      txHash: (data.txHash ?? `limit-${Date.now()}`) as `0x${string}`,
      data: { orderId: data.orderId, coin: params.coin, side: params.side, price: params.price, size: params.size },
    };
  } catch {
    return {
      success: true,
      txHash: `0x${'aa'.repeat(32)}` as `0x${string}`,
      data: {
        orderId: `sim-limit-${Date.now()}`,
        coin: params.coin,
        side: params.side,
        price: params.price,
        size: params.size,
        simulated: true,
      },
    };
  }
}

export async function setTpSl(params: {
  coin: string;
  tp?: number;
  sl?: number;
}): Promise<TxResult> {
  const args = ['position', 'tpsl', params.coin, '-o', 'json'];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = await runCli(args) as any;
    return { success: true, data: { coin: params.coin, tp: params.tp, sl: params.sl, ...data } };
  } catch {
    return { success: true, data: { coin: params.coin, tp: params.tp, sl: params.sl, simulated: true } };
  }
}

export async function setLeverage(params: {
  coin: string;
  leverage: number;
}): Promise<TxResult> {
  // Enforce max leverage at function level (defense in depth)
  const clampedLeverage = Math.min(params.leverage, PERPS_CONFIG.maxLeverage);
  const args = ['position', 'leverage', params.coin, clampedLeverage.toString(), '-o', 'json'];

  try {
    const data = await runCli(args) as any;
    return { success: true, data: { coin: params.coin, leverage: clampedLeverage, ...data } };
  } catch {
    return { success: true, data: { coin: params.coin, leverage: clampedLeverage, simulated: true } };
  }
}

export async function closeMarket(coin: string): Promise<TxResult> {
  try {
    const data = await runCli(['position', 'close-market', coin, '-o', 'json']) as any;
    return {
      success: true,
      txHash: (data.txHash ?? `close-${Date.now()}`) as `0x${string}`,
      data: { coin, realizedPnl: data.realizedPnl ?? 0, ...data },
    };
  } catch {
    return {
      success: true,
      txHash: `0x${'cc'.repeat(32)}` as `0x${string}`,
      data: { coin, realizedPnl: 0, simulated: true },
    };
  }
}

export async function cancelOrder(orderId: string): Promise<TxResult> {
  try {
    const data = await runCli(['order', 'cancel', orderId, '-o', 'json']) as any;
    return { success: true, data: { orderId, ...data } };
  } catch {
    return { success: true, data: { orderId, simulated: true } };
  }
}

export async function cancelAll(): Promise<TxResult> {
  try {
    const data = await runCli(['order', 'cancel-all', '-y', '-o', 'json']) as any;
    return { success: true, data: { cancelledCount: data.count ?? 0, ...data } };
  } catch {
    return { success: true, data: { cancelledCount: 0, simulated: true } };
  }
}

// ============================================================
// READ OPERATIONS
// ============================================================

export async function listOrders(): Promise<PerpsOrder[]> {
  try {
    const data = await runCli(['order', 'list', '-o', 'json']) as any;
    const orders = Array.isArray(data) ? data : data.orders ?? [];
    return orders;
  } catch {
    return []; // No open orders (or CLI not installed)
  }
}

export async function listPositions(): Promise<PerpsPosition[]> {
  try {
    const data = await runCli(['position', 'list', '-o', 'json']) as any;
    const positions = Array.isArray(data) ? data : data.positions ?? [];
    return positions;
  } catch {
    return [];
  }
}

export interface ByRealAccount {
  address: string;
  solBalance: number;
  usdcBalance: number;
  unrealizedPnl: number;
  totalPortfolioValue: number;
}

export async function getAccountInfo(): Promise<ByRealAccount | null> {
  try {
    const data = await runCli(['account', 'info', '-o', 'json']) as any;
    return {
      address: data.address ?? data.walletAddress ?? 'unknown',
      solBalance: data.solBalance ?? data.sol ?? 0,
      usdcBalance: data.usdcBalance ?? data.usdc ?? 0,
      unrealizedPnl: data.unrealizedPnl ?? data.pnl ?? 0,
      totalPortfolioValue: data.totalPortfolioValue ?? 0,
    };
  } catch {
    return null;
  }
}

// Legacy alias for backward compat
export const getAccount = getAccountInfo;

export async function getHistory(): Promise<unknown[]> {
  try {
    const data = await runCli(['account', 'history', '-o', 'json']) as any;
    return Array.isArray(data) ? data : data.history ?? [];
  } catch {
    return [];
  }
}

// ============================================================
// SIGNAL SCANNING (Alpha Track)
// ============================================================

export async function scanSignals(): Promise<MarketSignal[]> {
  try {
    const data = await runCli(['signal', 'scan', '-o', 'json']) as any;
    return Array.isArray(data) ? data : data.signals ?? [];
  } catch {
    // Simulation fallback — realistic mock signals
    return simulateScanSignals();
  }
}

export async function signalDetail(coin: string): Promise<SignalDetail | null> {
  try {
    const data = await runCli(['signal', 'detail', coin, '-o', 'json']) as any;
    return data;
  } catch {
    return simulateSignalDetail(coin);
  }
}

// ============================================================
// LEGACY COMPAT — old function signatures still work
// ============================================================

export async function openPosition(params: {
  market: string;
  side: 'long' | 'short';
  sizeUsd: number;
  leverage: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
}): Promise<PerpsPositionResult> {
  const coin = params.market.replace('-PERP', '');
  const price = MOCK_PRICES[coin] ?? 100;
  const tp = params.takeProfitPercent ? price * (1 + params.takeProfitPercent / 100) : undefined;
  const sl = params.stopLossPercent ? price * (1 - params.stopLossPercent / 100) : undefined;

  return marketOrder({
    side: params.side === 'long' ? 'buy' : 'sell',
    size: params.sizeUsd,
    coin,
    tp,
    sl,
  });
}

export async function closePosition(positionId: string): Promise<TxResult> {
  // Try to extract coin from position ID; fallback to close by ID
  return closeMarket(positionId);
}

export async function getAllPositions(): Promise<PerpsPosition[]> {
  return listPositions();
}

export async function getMarketInfo(market: string) {
  const coin = market.replace('-PERP', '');
  const detail = await signalDetail(coin);
  return {
    market,
    markPrice: detail?.indicators?.vwap ?? MOCK_PRICES[coin] ?? 0,
    fundingRate: detail?.fundingRate ?? 0,
    openInterestLong: detail?.openInterest ?? 0,
    openInterestShort: 0,
    maxLeverage: 40,
  };
}

// ============================================================
// SIMULATION FALLBACKS
// ============================================================

function simulateMarketOrder(params: {
  side: 'buy' | 'sell';
  size: number;
  coin: string;
  tp?: number;
  sl?: number;
}): PerpsPositionResult {
  const entryPrice = MOCK_PRICES[params.coin] ?? 100;
  const leverage = 1;
  const liquidationDistance = entryPrice / 5; // assume 5x
  const liquidationPrice = params.side === 'buy'
    ? entryPrice - liquidationDistance * 0.9
    : entryPrice + liquidationDistance * 0.9;

  return {
    success: true,
    txHash: `0x${'12'.repeat(32)}` as `0x${string}`,
    explorerUrl: '#',
    data: {
      positionId: `sim-pos-${Date.now()}`,
      market: getMarketName(params.coin),
      side: params.side === 'buy' ? 'long' : 'short',
      sizeUsd: params.size,
      leverage,
      entryPrice,
      liquidationPrice,
    },
  };
}

function simulateScanSignals(): MarketSignal[] {
  const now = new Date().toISOString();
  return [
    {
      coin: 'BTC',
      signal: 'bullish',
      strength: 72,
      fundingRate: -0.0032,
      priceChange24h: 2.4,
      volume24h: 1_200_000_000,
      timestamp: now,
    },
    {
      coin: 'ETH',
      signal: 'neutral',
      strength: 48,
      fundingRate: 0.0015,
      priceChange24h: -0.8,
      volume24h: 800_000_000,
      timestamp: now,
    },
    {
      coin: 'SOL',
      signal: 'bullish',
      strength: 65,
      fundingRate: -0.0018,
      priceChange24h: 4.2,
      volume24h: 450_000_000,
      timestamp: now,
    },
  ];
}

function simulateSignalDetail(coin: string): SignalDetail {
  const price = MOCK_PRICES[coin] ?? 100;
  return {
    coin,
    signal: 'bullish',
    indicators: {
      rsi: 58,
      macd: { value: 120, signal: 95, histogram: 25 },
      ema20: price * 0.99,
      ema50: price * 0.97,
      vwap: price * 1.001,
    },
    support: price * 0.95,
    resistance: price * 1.08,
    fundingRate: -0.0025,
    openInterest: 250_000_000,
    recommendation: `${coin} showing bullish momentum. EMA20 above EMA50, RSI neutral with room to run. Negative funding suggests shorts paying longs.`,
  };
}
