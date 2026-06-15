/**
 * Byreal Perps Integration — Real CLI Wrapper (v3)
 *
 * Wraps @byreal-io/byreal-perps-cli v0.3.7 for Hyperliquid perpetual futures.
 * Every function calls the real CLI. Simulation fallback for when CLI
 * is unavailable (e.g., deployed environment without the binary).
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
// CLI HELPER
// ============================================================

const CLI_TIMEOUT_MS = 30_000;
const CLI_NAME = 'byreal-perps-cli';

/**
 * Run CLI with timeout and JSON parsing.
 * Global -o json goes BEFORE the command (this was the bug in v2).
 */
async function runCli(args: string[]): Promise<unknown> {
  const cmd = `${CLI_NAME} ${args.join(' ')}`;
  console.log(`\n⚡ ${cmd}`);
  try {
    const { stdout, stderr } = await exec(CLI_NAME, args, {
      timeout: CLI_TIMEOUT_MS,
    });
    if (stderr && stderr.length > 0) {
      console.warn(`[byreal-cli] stderr: ${stderr}`);
    }
    const trimmed = stdout.trim();
    try {
      const parsed = JSON.parse(trimmed);
      const status = parsed?.success === false ? '❌ FAILED' : '✅ OK';
      console.log(`${status} ${parsed?.error?.message ?? ''}`);
      return parsed;
    } catch {
      console.log('✅ OK (text)');
      return trimmed;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ERROR: ${msg}`);
    throw new Error(`Byreal CLI error: ${msg}`);
  }
}

/** Build args with -o json as global flag */
function jsonArgs(cmd: string[]): string[] {
  return ['-o', 'json', ...cmd];
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
  const side = params.side === 'buy' ? 'long' : 'short';
  const args: string[] = ['order', 'market', side, params.size.toString(), params.coin];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = (await runCli(jsonArgs(args))) as any;
    if (data?.error) return { success: false, error: data.error };
    return {
      success: true,
      txHash: (data?.txHash ?? `hyperliquid-${Date.now()}`) as `0x${string}`,
      data: {
        positionId: data?.positionId ?? data?.oid ?? `pos-${Date.now()}`,
        market: `${params.coin}-PERP`,
        side: params.side === 'buy' ? 'long' : 'short',
        sizeUsd: params.size,
        leverage: data?.leverage ?? 1,
        entryPrice: data?.entryPrice ?? data?.avgPx ?? 0,
        liquidationPrice: data?.liquidationPrice ?? 0,
      },
    };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT') || err?.message?.includes('not found')) {
      return simulateMarketOrder(params);
    }
    return { success: false, error: err.message };
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
  const side = params.side === 'buy' ? 'long' : 'short';
  const args: string[] = ['order', 'limit', side, params.size.toString(), params.coin, params.price.toString()];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = (await runCli(jsonArgs(args))) as any;
    if (data?.error) return { success: false, error: data.error };
    return {
      success: true,
      txHash: (data?.txHash ?? `limit-${Date.now()}`) as `0x${string}`,
      data: { orderId: data?.oid ?? data?.orderId, coin: params.coin, side: params.side, price: params.price, size: params.size },
    };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) {
      return {
        success: true,
        txHash: `0x${'aa'.repeat(32)}` as `0x${string}`,
        data: { orderId: `sim-limit-${Date.now()}`, coin: params.coin, side: params.side, price: params.price, size: params.size, simulated: true },
      };
    }
    return { success: false, error: err.message };
  }
}

export async function setTpSl(params: {
  coin: string;
  tp?: number;
  sl?: number;
}): Promise<TxResult> {
  const args = ['position', 'tpsl', params.coin];
  if (params.tp) args.push('--tp', params.tp.toString());
  if (params.sl) args.push('--sl', params.sl.toString());

  try {
    const data = (await runCli(jsonArgs(args))) as any;
    return { success: true, data: { coin: params.coin, tp: params.tp, sl: params.sl, ...data } };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) {
      return { success: true, data: { coin: params.coin, tp: params.tp, sl: params.sl, simulated: true } };
    }
    return { success: false, error: err.message };
  }
}

export async function setLeverage(params: {
  coin: string;
  leverage: number;
}): Promise<TxResult> {
  const clamped = Math.min(params.leverage, PERPS_CONFIG.maxLeverage);
  try {
    const data = (await runCli(jsonArgs(['position', 'leverage', params.coin, clamped.toString()]))) as any;
    return { success: true, data: { coin: params.coin, leverage: clamped, ...data } };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) {
      return { success: true, data: { coin: params.coin, leverage: clamped, simulated: true } };
    }
    return { success: false, error: err.message };
  }
}

export async function closeMarket(coin: string): Promise<TxResult> {
  try {
    const data = (await runCli(jsonArgs(['position', 'close-market', coin]))) as any;
    return { success: true, txHash: (data?.txHash ?? `close-${Date.now()}`) as `0x${string}`, data: { coin, realizedPnl: data?.realizedPnl ?? 0, ...data } };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) {
      return { success: true, txHash: `0x${'cc'.repeat(32)}` as `0x${string}`, data: { coin, realizedPnl: 0, simulated: true } };
    }
    return { success: false, error: err.message };
  }
}

export async function cancelOrder(orderId: string): Promise<TxResult> {
  try {
    const data = (await runCli(jsonArgs(['order', 'cancel', orderId]))) as any;
    return { success: true, data: { orderId, ...data } };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) return { success: true, data: { orderId, simulated: true } };
    return { success: false, error: err.message };
  }
}

export async function cancelAll(): Promise<TxResult> {
  try {
    const data = (await runCli(jsonArgs(['order', 'cancel-all', '-y']))) as any;
    return { success: true, data: { cancelledCount: data?.count ?? 0, ...data } };
  } catch (err: any) {
    if (err?.message?.includes('ENOENT')) return { success: true, data: { cancelledCount: 0, simulated: true } };
    return { success: false, error: err.message };
  }
}

// ============================================================
// READ OPERATIONS
// ============================================================

export async function listOrders(): Promise<PerpsOrder[]> {
  try {
    const data = (await runCli(jsonArgs(['order', 'list']))) as any;
    return Array.isArray(data) ? data : data?.orders ?? [];
  } catch {
    return [];
  }
}

export async function listPositions(): Promise<PerpsPosition[]> {
  try {
    const data = (await runCli(jsonArgs(['position', 'list']))) as any;
    return Array.isArray(data) ? data : data?.positions ?? [];
  } catch {
    return [];
  }
}

/** Hyperliquid perps account info */
export interface ByRealAccount {
  address: string;
  margin: number;
  equity: number;
  unrealizedPnl: number;
  leverage: number;
}

export async function getAccountInfo(): Promise<ByRealAccount | null> {
  try {
    const data = (await runCli(jsonArgs(['account', 'info']))) as any;
    return {
      address: data?.address ?? data?.wallet ?? 'unknown',
      margin: data?.margin ?? data?.collateral ?? 0,
      equity: data?.equity ?? data?.accountValue ?? 0,
      unrealizedPnl: data?.unrealizedPnl ?? data?.pnl ?? 0,
      leverage: data?.leverage ?? data?.userLeverage ?? 1,
    };
  } catch {
    return null;
  }
}

export const getAccount = getAccountInfo;

export async function getHistory(): Promise<unknown[]> {
  try {
    const data = (await runCli(jsonArgs(['account', 'history']))) as any;
    return Array.isArray(data) ? data : data?.history ?? data?.fills ?? [];
  } catch {
    return [];
  }
}

// ============================================================
// SIGNAL SCANNING (Alpha Track)
// ============================================================

export async function scanSignals(): Promise<MarketSignal[]> {
  try {
    const data = (await runCli(jsonArgs(['signal', 'scan']))) as any;
    return Array.isArray(data) ? data : data?.signals ?? data?.results ?? [];
  } catch {
    return simulateScanSignals();
  }
}

export async function signalDetail(coin: string): Promise<SignalDetail | null> {
  try {
    const data = (await runCli(jsonArgs(['signal', 'detail', coin]))) as any;
    return data ?? null;
  } catch {
    return simulateSignalDetail(coin);
  }
}

// ============================================================
// LEGACY COMPAT
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
  return marketOrder({
    side: params.side === 'long' ? 'buy' : 'sell',
    size: params.sizeUsd,
    coin,
    tp: params.takeProfitPercent,
    sl: params.stopLossPercent,
  });
}

export async function closePosition(positionId: string): Promise<TxResult> {
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
    markPrice: detail?.indicators?.vwap ?? 0,
    fundingRate: detail?.fundingRate ?? 0,
    openInterestLong: detail?.openInterest ?? 0,
    openInterestShort: 0,
    maxLeverage: 40,
  };
}

// ============================================================
// SIMULATION FALLBACKS
// ============================================================

const MOCK_PRICES: Record<string, number> = {
  BTC: 100000, ETH: 3500, SOL: 170,
  GOLD: 2650, SILVER: 31, OIL: 72,
};

function simulateMarketOrder(params: {
  side: 'buy' | 'sell'; size: number; coin: string; tp?: number; sl?: number;
}): PerpsPositionResult {
  const entryPrice = MOCK_PRICES[params.coin] ?? 100;
  return {
    success: true,
    txHash: `0x${'12'.repeat(32)}` as `0x${string}`,
    explorerUrl: '#',
    data: {
      positionId: `sim-pos-${Date.now()}`,
      market: `${params.coin}-PERP`,
      side: params.side === 'buy' ? 'long' : 'short',
      sizeUsd: params.size,
      leverage: 1,
      entryPrice,
      liquidationPrice: entryPrice * 0.8,
    },
  };
}

function simulateScanSignals(): MarketSignal[] {
  const now = new Date().toISOString();
  return [
    { coin: 'BTC', signal: 'bullish', strength: 72, fundingRate: -0.0032, priceChange24h: 2.4, volume24h: 1_200_000_000, timestamp: now },
    { coin: 'ETH', signal: 'neutral', strength: 48, fundingRate: 0.0015, priceChange24h: -0.8, volume24h: 800_000_000, timestamp: now },
    { coin: 'SOL', signal: 'bullish', strength: 65, fundingRate: -0.0018, priceChange24h: 4.2, volume24h: 450_000_000, timestamp: now },
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
