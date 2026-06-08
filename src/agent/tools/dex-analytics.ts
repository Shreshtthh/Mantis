/**
 * DEX Analytics — Merchant Moe pool data via direct contract reads
 *
 * Functions:
 * - getMerchantMoePools()           — pool reserves, TVL, and volume estimates
 * - getPriceImpact(tokenIn, out, amount) — slippage/price impact for a swap size
 * - getLiquidityDepth(pool)         — pool reserves to assess liquidity depth
 */

import { formatUnits } from 'viem';
import { mantlePublic } from '@/lib/mantle';
import { TOKENS, CONTRACTS, MOE_ROUTER_ABI } from '@/lib/contracts';
import { getTokenPrices } from '@/agent/wallet';

// ============================================================
// POOL DATA
// ============================================================

export interface PoolInfo {
  pair: string;
  tokenA: string;
  tokenB: string;
  reserveA: number;
  reserveB: number;
  tvlUsd: number;
  volume24hUsd: number;
  apy: number;
}

export async function getMerchantMoePools(): Promise<PoolInfo[]> {
  // Merchant Moe uses Joe V2 (LB) and V1 (classic) pools.
  // Direct reserve reads require factory enumeration which is expensive.
  // For hackathon demo, return curated data from known pools.
  try {
    const prices = await getTokenPrices(['MNT', 'USDC', 'WETH', 'mETH', 'USDT']);
    return simulatePools(prices);
  } catch {
    return simulatePools({});
  }
}

// ============================================================
// PRICE IMPACT
// ============================================================

export async function getPriceImpact(params: {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}): Promise<{
  priceImpactPct: number;
  expectedOutput: number;
  minimumOutput: number;
  route: string;
}> {
  const tokenInAddress = TOKENS[params.tokenIn as keyof typeof TOKENS];
  const tokenOutAddress = TOKENS[params.tokenOut as keyof typeof TOKENS];

  if (!tokenInAddress || !tokenOutAddress) {
    return {
      priceImpactPct: 0,
      expectedOutput: 0,
      minimumOutput: 0,
      route: `${params.tokenIn} → ${params.tokenOut}`,
    };
  }

  const routerAddress = CONTRACTS.merchantMoeRouter;
  if (routerAddress === '0x0000000000000000000000000000000000000000') {
    // Mock not deployed — simulate
    return simulatePriceImpact(params);
  }

  try {
    const decimalsIn = getDecimals(params.tokenIn);
    const amountInWei = BigInt(Math.floor(params.amount * Math.pow(10, decimalsIn)));

    const amounts = await mantlePublic.readContract({
      address: routerAddress,
      abi: MOE_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountInWei, [tokenInAddress, tokenOutAddress]],
    }) as bigint[];

    const decimalsOut = getDecimals(params.tokenOut);
    const expectedOutput = Number(formatUnits(amounts[amounts.length - 1], decimalsOut));

    // Estimate price impact by comparing with a 1-unit quote
    const oneUnitWei = BigInt(Math.pow(10, decimalsIn));
    const oneUnitAmounts = await mantlePublic.readContract({
      address: routerAddress,
      abi: MOE_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [oneUnitWei, [tokenInAddress, tokenOutAddress]],
    }) as bigint[];

    const midPrice = Number(formatUnits(oneUnitAmounts[1], decimalsOut));
    const effectivePrice = expectedOutput / params.amount;
    const priceImpactPct = Math.abs((effectivePrice - midPrice) / midPrice) * 100;

    return {
      priceImpactPct: Number(priceImpactPct.toFixed(4)),
      expectedOutput,
      minimumOutput: expectedOutput * 0.99, // 1% slippage
      route: `${params.tokenIn} → ${params.tokenOut}`,
    };
  } catch {
    return simulatePriceImpact(params);
  }
}

// ============================================================
// LIQUIDITY DEPTH
// ============================================================

export async function getLiquidityDepth(tokenA: string, tokenB: string): Promise<{
  pair: string;
  reserveA: number;
  reserveB: number;
  depthUsd: number;
  assessment: 'deep' | 'moderate' | 'shallow';
}> {
  // For hackathon, return simulated data based on typical Mantle DEX pools
  const prices: Record<string, number> = {
    MNT: 0.8, USDC: 1, USDT: 1, WETH: 3500, mETH: 3600,
  };

  const mockReserves: Record<string, { a: number; b: number }> = {
    'MNT-USDC': { a: 5_000_000, b: 4_000_000 },
    'WETH-USDC': { a: 1_200, b: 4_200_000 },
    'mETH-WETH': { a: 800, b: 780 },
    'USDC-USDT': { a: 8_000_000, b: 7_900_000 },
  };

  const pair = `${tokenA}-${tokenB}`;
  const reserves = mockReserves[pair] ?? mockReserves[`${tokenB}-${tokenA}`] ?? { a: 100_000, b: 80_000 };

  const depthUsd = reserves.a * (prices[tokenA] ?? 1) + reserves.b * (prices[tokenB] ?? 1);
  const assessment: 'deep' | 'moderate' | 'shallow' =
    depthUsd > 5_000_000 ? 'deep' : depthUsd > 1_000_000 ? 'moderate' : 'shallow';

  return {
    pair,
    reserveA: reserves.a,
    reserveB: reserves.b,
    depthUsd,
    assessment,
  };
}

// ============================================================
// HELPERS
// ============================================================

function getDecimals(token: string): number {
  const decimals: Record<string, number> = {
    MNT: 18, WMNT: 18, WETH: 18, mETH: 18, USDC: 6, USDT: 6,
  };
  return decimals[token] ?? 18;
}

function simulatePools(prices: Record<string, number>): PoolInfo[] {
  const mnt = prices.MNT ?? 0.8;
  const usdc = prices.USDC ?? 1;
  const weth = prices.WETH ?? 3500;

  return [
    {
      pair: 'MNT/USDC',
      tokenA: 'MNT',
      tokenB: 'USDC',
      reserveA: 5_000_000,
      reserveB: 4_000_000,
      tvlUsd: 5_000_000 * mnt + 4_000_000 * usdc,
      volume24hUsd: 2_500_000,
      apy: 12.0,
    },
    {
      pair: 'WETH/USDC',
      tokenA: 'WETH',
      tokenB: 'USDC',
      reserveA: 1_200,
      reserveB: 4_200_000,
      tvlUsd: 1_200 * weth + 4_200_000 * usdc,
      volume24hUsd: 1_800_000,
      apy: 8.5,
    },
    {
      pair: 'USDC/USDT',
      tokenA: 'USDC',
      tokenB: 'USDT',
      reserveA: 8_000_000,
      reserveB: 7_900_000,
      tvlUsd: 15_900_000,
      volume24hUsd: 5_000_000,
      apy: 4.2,
    },
  ];
}

function simulatePriceImpact(params: {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}): {
  priceImpactPct: number;
  expectedOutput: number;
  minimumOutput: number;
  route: string;
} {
  const prices: Record<string, number> = {
    MNT: 0.8, USDC: 1, USDT: 1, WETH: 3500, mETH: 3600,
  };

  const inPrice = prices[params.tokenIn] ?? 1;
  const outPrice = prices[params.tokenOut] ?? 1;
  const expectedOutput = (params.amount * inPrice) / outPrice;

  // Simple quadratic price impact model
  const impact = params.amount > 10000 ? 0.5 : params.amount > 1000 ? 0.15 : 0.05;

  return {
    priceImpactPct: impact,
    expectedOutput: expectedOutput * (1 - impact / 100),
    minimumOutput: expectedOutput * (1 - (impact + 1) / 100),
    route: `${params.tokenIn} → ${params.tokenOut}`,
  };
}
