/**
 * Lendle Lending Protocol Integration (Aave V2 fork)
 *
 * On mainnet: real Lendle pool
 * On testnet: MockLendingPool (same ABI, simulated APYs)
 *
 * Functions:
 * - getLendingRates(token) — current supply/borrow APY
 * - deposit(token, amount) — supply to lending pool, earn yield
 * - withdraw(token, amount) — withdraw from pool
 * - getUserPositions(address) — active lending positions
 */

import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { getMantleWallet, mantlePublic, txUrl } from '@/lib/mantle';
import {
  ERC20_ABI,
  LENDLE_POOL_ABI,
  MOCK_LENDING_POOL_ABI,
  TOKENS,
  CONTRACTS,
} from '@/lib/contracts';
import { NETWORK } from '@/agent/config';
import { ensureApproval } from '@/agent/wallet';
import type { LendleDepositResult, LendlePosition } from '@/lib/types';

const TOKEN_DECIMALS: Record<string, number> = {
  MNT: 18, WMNT: 18, WETH: 18, mETH: 18, USDC: 6, USDT: 6
};

// ============================================================
// LENDING RATES
// ============================================================

// Simulated APYs for testnet (mock contracts return these)
const MOCK_RATES: Record<string, { supplyApy: number; borrowApy: number; utilization: number }> = {
  USDC: { supplyApy: 6.2, borrowApy: 8.5, utilization: 72 },
  USDT: { supplyApy: 5.8, borrowApy: 8.1, utilization: 68 },
  mETH: { supplyApy: 3.1, borrowApy: 5.2, utilization: 55 },
  WETH: { supplyApy: 2.8, borrowApy: 4.9, utilization: 52 },
  MNT: { supplyApy: 4.5, borrowApy: 7.0, utilization: 63 },
};

export async function getLendingRates(token: string): Promise<{
  supplyApy: number;
  borrowApy: number;
  utilization: number;
  aTokenAddress?: string;
}> {
  const poolAddress = CONTRACTS.lendlePool;

  // No pool deployed
  if (poolAddress === '0x0000000000000000000000000000000000000000') {
    return MOCK_RATES[token] ?? { supplyApy: 3.0, borrowApy: 5.0, utilization: 50 };
  }

  const tokenAddress = TOKENS[token as keyof typeof TOKENS];
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Unknown token: ${token}`);
  }

  try {
    const poolAbi = NETWORK === 'mainnet' ? LENDLE_POOL_ABI : MOCK_LENDING_POOL_ABI;

    if (NETWORK === 'testnet') {
      // MockLendingPool stores supplyApy directly (basis points).
      // Use encodeFunctionData + call to bypass strict ABI typing
      // (the shared ABI has getReserveData but not supplyApy).
      const supplyApyData = encodeFunctionData({
        abi: [{
          type: 'function', name: 'supplyApy',
          inputs: [{ type: 'address', name: 'asset' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        } as const],
        functionName: 'supplyApy',
        args: [tokenAddress],
      });
      const apyHex = await mantlePublic.call({ to: poolAddress, data: supplyApyData });
      const apyBps = apyHex.data ? BigInt(apyHex.data as `0x${string}`) : 0n;

      const supplyApy = Number(apyBps) / 100; // bps → %
      const borrowApy = supplyApy * 1.4; // typical borrow ~1.4x supply
      return {
        supplyApy,
        borrowApy,
        utilization: 50 + Math.round(supplyApy * 5),
        aTokenAddress: undefined,
      };
    }

    // Mainnet: read from real Lendle pool
    const reserveData = await mantlePublic.readContract({
      address: poolAddress,
      abi: LENDLE_POOL_ABI,
      functionName: 'getReserveData',
      args: [tokenAddress],
    }) as {
      currentLiquidityRate: bigint;
      currentVariableBorrowRate: bigint;
      aTokenAddress: string;
    };

    // Aave V2 rates are in Ray (1e27), convert to APY%
    const RAY = 10n ** 27n;
    const SECONDS_PER_YEAR = 31_536_000n;

    const supplyRatePerSecond = reserveData.currentLiquidityRate / RAY;
    const borrowRatePerSecond = reserveData.currentVariableBorrowRate / RAY;

    const supplyApy = Number(supplyRatePerSecond) * Number(SECONDS_PER_YEAR) * 100;
    const borrowApy = Number(borrowRatePerSecond) * Number(SECONDS_PER_YEAR) * 100;

    return {
      supplyApy: Number(supplyApy.toFixed(2)),
      borrowApy: Number(borrowApy.toFixed(2)),
      utilization: 0, // Would need dataProvider for exact utilization
      aTokenAddress: reserveData.aTokenAddress,
    };
  } catch {
    return MOCK_RATES[token] ?? { supplyApy: 3.0, borrowApy: 5.0, utilization: 50 };
  }
}

// ============================================================
// DEPOSIT
// ============================================================

export async function deposit(params: {
  token: string;
  amount: number;
}): Promise<LendleDepositResult> {
  const poolAddress = CONTRACTS.lendlePool;

  // Simulated deposit when mock not deployed
  if (poolAddress === '0x0000000000000000000000000000000000000000') {
    return simulateDeposit(params);
  }

  const { wallet, account } = getMantleWallet();
  const tokenAddress = TOKENS[params.token as keyof typeof TOKENS];
  const decimals = TOKEN_DECIMALS[params.token] ?? 18;
  const amountWei = parseUnits(params.amount.toString(), decimals);
  const poolAbi = NETWORK === 'mainnet' ? LENDLE_POOL_ABI : MOCK_LENDING_POOL_ABI;

  try {
    // Approve pool to spend token
    await ensureApproval(tokenAddress, poolAddress, amountWei);

    const txHash = await wallet.writeContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: 'deposit',
      args: [tokenAddress, amountWei, account.address, 0],
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash: txHash });
    const rates = await getLendingRates(params.token);

    return {
      success: receipt.status === 'success',
      txHash,
      explorerUrl: txUrl(txHash),
      data: {
        token: params.token,
        amount: params.amount,
        apy: rates.supplyApy,
        aTokenReceived: params.amount, // 1:1 initially
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Deposit failed',
    };
  }
}

// ============================================================
// WITHDRAW
// ============================================================

export async function withdraw(params: {
  token: string;
  amount: number; // Use Infinity or a very large number to withdraw all
}): Promise<LendleDepositResult> {
  const poolAddress = CONTRACTS.lendlePool;

  if (poolAddress === '0x0000000000000000000000000000000000000000') {
    return simulateWithdraw(params);
  }

  const { wallet, account } = getMantleWallet();
  const tokenAddress = TOKENS[params.token as keyof typeof TOKENS];
  const decimals = TOKEN_DECIMALS[params.token] ?? 18;
  const amountWei = parseUnits(params.amount.toString(), decimals);
  const poolAbi = NETWORK === 'mainnet' ? LENDLE_POOL_ABI : MOCK_LENDING_POOL_ABI;

  try {
    const txHash = await wallet.writeContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: 'withdraw',
      args: [tokenAddress, amountWei, account.address],
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash: txHash });

    return {
      success: receipt.status === 'success',
      txHash,
      explorerUrl: txUrl(txHash),
      data: {
        token: params.token,
        amount: params.amount,
        apy: 0,
        aTokenReceived: 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Withdraw failed',
    };
  }
}

// ============================================================
// USER POSITIONS (reads aToken balances)
// ============================================================

export async function getUserPositions(address: `0x${string}`): Promise<LendlePosition[]> {
  // On testnet without deployed mocks, return empty
  const poolAddress = CONTRACTS.lendlePool;
  if (poolAddress === '0x0000000000000000000000000000000000000000') {
    return [];
  }

  // In a full implementation, we'd read aToken balances from the Lendle DataProvider
  // For now, return empty until mainnet
  return [];
}

/**
 * Get on-chain lending rates for all supported tokens at once.
 * Used by the status API and dashboard YieldTable.
 */
export async function getAllLendingRates(): Promise<
  Record<string, { supplyApy: number; borrowApy: number; utilization: number }>
> {
  const tokens = ['USDC', 'USDT', 'WETH', 'mETH', 'MNT'];
  const results: Record<string, { supplyApy: number; borrowApy: number; utilization: number }> = {};

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const rates = await getLendingRates(token);
        results[token] = rates;
      } catch {
        results[token] = { supplyApy: 0, borrowApy: 0, utilization: 0 };
      }
    })
  );

  return results;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Encode Lendle deposit calldata for vault execution.
 */
export function encodeLendleDepositData(params: {
  token: string;
  amount: number;
  onBehalfOf: `0x${string}`; // vault address
}): `0x${string}` {
  const tokenAddress = TOKENS[params.token as keyof typeof TOKENS];
  const decimals = TOKEN_DECIMALS[params.token] ?? 18;
  const amountWei = parseUnits(params.amount.toString(), decimals);
  const poolAbi = NETWORK === 'mainnet' ? LENDLE_POOL_ABI : MOCK_LENDING_POOL_ABI;

  return encodeFunctionData({
    abi: poolAbi as any,
    functionName: 'deposit',
    args: [tokenAddress, amountWei, params.onBehalfOf, 0],
  });
}

/**
 * Encode Lendle withdraw calldata for vault execution.
 */
export function encodeLendleWithdrawData(params: {
  token: string;
  amount: number;
  to: `0x${string}`; // vault address (or user if direct)
}): `0x${string}` {
  const tokenAddress = TOKENS[params.token as keyof typeof TOKENS];
  const decimals = TOKEN_DECIMALS[params.token] ?? 18;
  const amountWei = parseUnits(params.amount.toString(), decimals);
  const poolAbi = NETWORK === 'mainnet' ? LENDLE_POOL_ABI : MOCK_LENDING_POOL_ABI;

  return encodeFunctionData({
    abi: poolAbi as any,
    functionName: 'withdraw',
    args: [tokenAddress, amountWei, params.to],
  });
}

/**
 * Encode ERC-20 approve for vault execution (Lendle version).
 */
export function encodeLendleApproveData(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI as any,
    functionName: 'approve',
    args: [spender, amount],
  });
}

function simulateDeposit(params: { token: string; amount: number }): LendleDepositResult {
  const rates = MOCK_RATES[params.token] ?? { supplyApy: 3.0 };
  const mockHash = `0x${'cd'.repeat(32)}` as `0x${string}`;
  return {
    success: true,
    txHash: mockHash,
    explorerUrl: '#',
    data: {
      token: params.token,
      amount: params.amount,
      apy: rates.supplyApy,
      aTokenReceived: params.amount,
    },
  };
}

function simulateWithdraw(params: { token: string; amount: number }): LendleDepositResult {
  const mockHash = `0x${'ef'.repeat(32)}` as `0x${string}`;
  return {
    success: true,
    txHash: mockHash,
    explorerUrl: '#',
    data: {
      token: params.token,
      amount: params.amount,
      apy: 0,
      aTokenReceived: 0,
    },
  };
}
