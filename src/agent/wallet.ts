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
import { config } from './config';
import type { WalletBalance, TokenBalance } from '@/lib/types';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(execFile);
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
  nativeBalance: string;
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
  if (balanceCalls.length > 0) {
    try {
      const [balances, decimals] = await Promise.all([
        mantlePublic.multicall({ contracts: balanceCalls }),
        mantlePublic.multicall({ contracts: decimalsCalls }),
      ]);
      balanceResults = balances.map((r) => (r.status === 'success' ? (r.result as bigint) : 0n));
      decimalsResults = decimals.map((r) => (r.status === 'success' ? (r.result as number) : 18));
    } catch {
      // Multicall not available on testnet or mock contracts not deployed
      balanceResults = new Array(tokenEntries.length).fill(0);
      decimalsResults = new Array(tokenEntries.length).fill(18);
    }
  }
  // Get token prices (USD)
  const prices = await getTokenPrices(tokenEntries.map(([symbol]) => symbol));
  const tokens: TokenBalance[] = tokenEntries.map(([symbol, tokenAddress], i) => {
    const balance = balanceResults[i] ?? 0;
    const decimals = decimalsResults[i] ?? 18;
    const balanceFormatted = Number(formatUnits(balance, decimals));
    const priceUsd = prices[symbol] ?? 0;
    return {
      symbol,
      address: tokenAddress,
      balance: balance.toString(),
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
    balance: nativeBalance.toString(),
    balanceFormatted: nativeFormatted,
    valueUsd: nativeFormatted * mntPrice,
  });
  const totalValueUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0);
  return { address, tokens, totalValueUsd, nativeBalance: nativeBalance.toString() };
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
// SOLANA TREASURY (Byreal CLI)
// ============================================================
/**
 * Get Solana/Byreal treasury balance via CLI.
 * Returns null if Byreal CLI is not installed or not configured.
 */
export async function getSolanaBalance(): Promise<{
  address: string;
  solBalance: number;
  usdcBalance: number;
  totalValueUsd: number;
} | null> {
  try {
    const { stdout } = await execAsync('byreal-perps-cli', ['account', 'info', '--json']);
    const data = JSON.parse(stdout) as {
      address?: string;
      walletAddress?: string;
      sol?: number;
      solBalance?: number;
      usdc?: number;
      usdcBalance?: number;
    };
    const prices = await getTokenPrices(['SOL', 'USDC']);
    const solBalance = data.sol ?? data.solBalance ?? 0;
    const usdcBalance = data.usdc ?? data.usdcBalance ?? 0;
    return {
      address: data.address ?? data.walletAddress ?? 'unknown',
      solBalance,
      usdcBalance,
      totalValueUsd: solBalance * (prices.SOL ?? 0) + usdcBalance * (prices.USDC ?? 1),
    };
  } catch {
    // Byreal CLI not installed or wallet not configured yet
    return null;
  }
}
// ============================================================
// COMBINED WALLET BALANCE
// ============================================================
export async function getWalletBalance(): Promise<WalletBalance> {
  const [mantleTreasury, solanaTreasury] = await Promise.all([
    getMantleBalance(),
    getSolanaBalance(),
  ]);
  return {
    mantleTreasury,
    solanaTreasury: solanaTreasury ?? undefined,
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
const PRICE_CACHE_TTL_MS = 30_000; // 30 seconds
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
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers, next: { revalidate: 30 } }
    );
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
    // Return fallback prices if CoinGecko is down
    return {
      MNT: 0.8,
      WMNT: 0.8,
      USDC: 1,
      USDT: 1,
      WETH: 2500,
      mETH: 2600,
      SOL: 150,
      BTC: 60000,
      ETH: 2500,
    };
  }
}
