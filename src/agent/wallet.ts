/**
 * Mantis Dual-Treasury Wallet
 *
 * Manages two independent execution layers:
 * - Mantle Treasury (EVM EOA via viem)
 * - Solana Treasury (Byreal CLI — balance reads only, execution via byreal-perps.ts)
 *
 * Both treasuries are pre-funded independently.
 * The agent routes execution to the correct wallet automatically.
 */

import { formatUnits } from 'viem';
import { getMantleWallet, mantlePublic, getAgentAddress } from '@/lib/mantle';
import { ERC20_ABI, TOKENS } from '@/lib/contracts';
import { config, NETWORK } from './config';
import type { WalletBalance, TokenBalance } from '@/lib/types';
// ============================================================
// MANTLE TREASURY (EVM)
// ============================================================

/**
 * Get all token balances for the Mantis agent wallet on Mantle.
 * Uses viem multicall for efficiency (one RPC call for all tokens).
 */
export async function getMantleBalance(): Promise<{
  address: string;
  tokens: TokenBalance[];
  totalValueUsd: number;
  nativeBalance: bigint;
}> {
  const address = getAgentAddress();

  // Get native MNT balance
  const nativeBalance = await mantlePublic.getBalance({ address });

  // Get all ERC-20 balances via multicall
  const tokenEntries = Object.entries(TOKENS).filter(
    ([, addr]) => addr !== '0x0000000000000000000000000000000000000000'
  );

  const balanceCalls = tokenEntries.map(([symbol, tokenAddress]) => ({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf' as const,
    args: [address] as const,
  }));

  const decimalsCalls = tokenEntries.map(([, tokenAddress]) => ({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals' as const,
  }));

  let balanceResults: bigint[] = [];
  let decimalsResults: number[] = [];

  // Multicall3 is not deployed on Mantle Sepolia. On testnet, skip
  // the multicall entirely and go straight to individual reads.
  const useMulticall = NETWORK !== 'testnet';

  if (balanceCalls.length > 0) {
    let multicallOk = false;
    if (useMulticall) {
      try {
        const [balances, decimals] = await Promise.all([
          mantlePublic.multicall({ contracts: balanceCalls }),
          mantlePublic.multicall({ contracts: decimalsCalls }),
        ]);
        balanceResults = balances.map((r) => (r.status === 'success' ? (r.result as bigint) : 0n));
        decimalsResults = decimals.map((r) => (r.status === 'success' ? (r.result as number) : 18));
        multicallOk = true;
      } catch {
        console.warn('[wallet] multicall failed, falling back to individual calls');
      }
    }
    if (!multicallOk) {
      for (const [i, [symbol, tokenAddress]] of tokenEntries.entries()) {
        try {
          const bal = await mantlePublic.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          });
          balanceResults[i] = bal as bigint;
        } catch { balanceResults[i] = 0n; }
        try {
          const dec = await mantlePublic.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'decimals',
          });
          decimalsResults[i] = dec as number;
        } catch { decimalsResults[i] = 18; }
      }
    }
  }

  // Get token prices (USD)
  const prices = await getTokenPrices(tokenEntries.map(([symbol]) => symbol));

  const tokens: TokenBalance[] = tokenEntries.map(([symbol, tokenAddress], i) => {
    const balance = balanceResults[i] ?? 0n;
    const decimals = decimalsResults[i] ?? 18;
    const balanceFormatted = Number(formatUnits(balance, decimals));
    const priceUsd = prices[symbol] ?? 0;
    return {
      symbol,
      address: tokenAddress,
      balance,
      balanceFormatted,
      valueUsd: balanceFormatted * priceUsd,
    };
  });

  // Add native MNT
  const mntPrice = prices['MNT'] ?? 0;
  const nativeFormatted = Number(formatUnits(nativeBalance, 18));
  tokens.unshift({
    symbol: 'MNT',
    address: 'native',
    balance: nativeBalance,
    balanceFormatted: nativeFormatted,
    valueUsd: nativeFormatted * mntPrice,
  });

  const totalValueUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0);

  return { address, tokens, totalValueUsd, nativeBalance };
}

/**
 * Ensure the agent wallet has approved a spender to spend `amount` of `token`.
 * If allowance is insufficient, submits an approval transaction.
 */
export async function ensureApproval(
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint
): Promise<`0x${string}` | null> {
  const { wallet, account } = getMantleWallet();

  const currentAllowance = await mantlePublic.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, spenderAddress],
  });

  if ((currentAllowance as bigint) >= amount) {
    return null; // Already approved
  }

  // Submit approval for max uint256 (standard DeFi pattern — approve once, use many times)
  const txHash = await wallet.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
  });

  await mantlePublic.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

// ============================================================
// BYREAL PERPS ACCOUNT (Hyperliquid)
// ============================================================

import { getAccountInfo as getByrealAccount } from '@/agent/tools/byreal-perps';

/**
 * Get Byreal Hyperliquid perps account portfolio.
 * Returns null if CLI not installed or account not configured.
 */
async function getByrealPortfolio(): Promise<{
  address: string;
  margin: number;
  equity: number;
  unrealizedPnl: number;
  leverage: number;
} | null> {
  try {
    return await getByrealAccount();
  } catch {
    return null;
  }
}

// ============================================================
// COMBINED WALLET BALANCE
// ============================================================

export async function getWalletBalance(): Promise<WalletBalance> {
  const [mantleTreasury, byrealAccount] = await Promise.all([
    getMantleBalance(),
    getByrealPortfolio(),
  ]);

  return {
    mantleTreasury,
    byrealAccount: byrealAccount ?? undefined,
  };
}

// ============================================================
// TOKEN PRICE FETCHER (CoinGecko)
// ============================================================

const COINGECKO_IDS: Record<string, string> = {
  MNT: 'mantle',
  WMNT: 'mantle',
  USDC: 'usd-coin',
  USDT: 'tether',
  WETH: 'weth',
  mETH: 'mantle-staked-ether',
  SOL: 'solana',
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

let _priceCache: { prices: Record<string, number>; fetchedAt: number } | null = null;
const PRICE_CACHE_TTL_MS = 5 * 60_000; // 5 minutes — avoids hammering CoinGecko
const FETCH_TIMEOUT_MS = 3_000;        // 3-second timeout — fail fast, use fallbacks

export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();

  // Use cache if fresh
  if (_priceCache && now - _priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return _priceCache.prices;
  }

  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s]).filter(Boolean))];

  if (ids.length === 0) {
    return {};
  }

  try {
    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

    // AbortController with timeout — CoinGecko can hang behind some networks
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers, signal: controller.signal, cache: 'no-store' }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data = await res.json() as Record<string, { usd: number }>;

    // Reverse-map from CoinGecko ID to symbol
    const prices: Record<string, number> = {};
    for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
      if (data[cgId]) {
        prices[symbol] = data[cgId].usd;
      }
    }

    // Stablecoin fallback
    if (!prices.USDC) prices.USDC = 1;
    if (!prices.USDT) prices.USDT = 1;

    _priceCache = { prices, fetchedAt: now };
    return prices;
  } catch {
    // CoinGecko unreachable — use cached prices if available, otherwise fallbacks.
    // On failure, extend the cache TTL so we don't retry on every request.
    if (_priceCache) {
      _priceCache.fetchedAt = now; // bump TTL — don't retry for another 5 min
      return _priceCache.prices;
    }

    // First-ever fetch and already failing — return hardcoded fallbacks
    const fallbacks: Record<string, number> = {
      MNT: 0.8, WMNT: 0.8, USDC: 1, USDT: 1,
      WETH: 2500, mETH: 2600, SOL: 150, BTC: 60000, ETH: 2500,
    };
    _priceCache = { prices: fallbacks, fetchedAt: now };
    return fallbacks;
  }
}
