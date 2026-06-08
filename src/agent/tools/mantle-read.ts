/**
 * Mantle Read Tools — read chain state without signing any transactions
 *
 * Functions:
 * - getTokenBalances(address) — all ERC-20 + native balances for any address
 * - getTokenPrice(symbol) — USD price via CoinGecko
 * - getTransactionHistory(address) — recent txs from Mantlescan API
 * - getGasPrice() — current gas estimate on Mantle
 */

import { formatUnits } from 'viem';
import { mantlePublic } from '@/lib/mantle';
import { ERC20_ABI, TOKENS } from '@/lib/contracts';
import { config } from '@/agent/config';
import { getTokenPrices } from '@/agent/wallet';
import type { TokenBalance } from '@/lib/types';

// ============================================================
// TOKEN BALANCES
// ============================================================

export async function getTokenBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  const tokenEntries = Object.entries(TOKENS).filter(
    ([, addr]) => addr !== '0x0000000000000000000000000000000000000000'
  );

  // Native balance
  const nativeBalance = await mantlePublic.getBalance({ address });

  const prices = await getTokenPrices([...tokenEntries.map(([s]) => s), 'MNT']);

  const tokens: TokenBalance[] = [];

  // Native MNT
  const nativeFormatted = Number(formatUnits(nativeBalance, 18));
  tokens.push({
    symbol: 'MNT',
    address: 'native',
    balance: nativeBalance,
    balanceFormatted: nativeFormatted,
    valueUsd: nativeFormatted * (prices.MNT ?? 0),
  });

  // ERC-20 tokens (multicall)
  if (tokenEntries.length > 0) {
    try {
      const balanceCalls = tokenEntries.map(([, tokenAddress]) => ({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf' as const,
        args: [address] as const,
      }));

      const results = await mantlePublic.multicall({ contracts: balanceCalls });

      for (let i = 0; i < tokenEntries.length; i++) {
        const [symbol, tokenAddress] = tokenEntries[i];
        const result = results[i];
        const balance = result.status === 'success' ? (result.result as bigint) : 0n;
        const balanceFormatted = Number(formatUnits(balance, 6)); // Most Mantle tokens are 6 decimals
        tokens.push({
          symbol,
          address: tokenAddress,
          balance,
          balanceFormatted,
          valueUsd: balanceFormatted * (prices[symbol] ?? 0),
        });
      }
    } catch {
      // Multicall not available (testnet without deployed mocks)
      for (const [symbol, tokenAddress] of tokenEntries) {
        tokens.push({
          symbol,
          address: tokenAddress,
          balance: 0n,
          balanceFormatted: 0,
          valueUsd: 0,
        });
      }
    }
  }

  return tokens;
}

// ============================================================
// GAS PRICE
// ============================================================

export async function getGasPrice(): Promise<{ gwei: number; formatted: string }> {
  try {
    const gasPrice = await mantlePublic.getGasPrice();
    const gwei = Number(formatUnits(gasPrice, 9));
    return { gwei, formatted: `${gwei.toFixed(2)} gwei` };
  } catch {
    return { gwei: 0, formatted: 'unavailable' };
  }
}

// ============================================================
// TRANSACTION HISTORY (Mantlescan API)
// ============================================================

interface MantlescanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  gasUsed: string;
  gasPrice: string;
}

export async function getTransactionHistory(
  address: `0x${string}`,
  limit = 10
): Promise<MantlescanTx[]> {
  const apiKey = process.env.MANTLESCAN_API_KEY ?? '';
  const baseUrl = config.explorerApi;

  try {
    const url = `${baseUrl}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=${limit}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json() as { status: string; result: MantlescanTx[] };
    if (data.status !== '1') return [];

    return data.result;
  } catch {
    return [];
  }
}

// ============================================================
// BLOCK INFO
// ============================================================

export async function getLatestBlock(): Promise<{ number: bigint; timestamp: bigint }> {
  const block = await mantlePublic.getBlock();
  return { number: block.number, timestamp: block.timestamp };
}
