/**
 * Merchant Moe DEX Integration
 *
 * On mainnet: uses the real MoeRouter at 0xeaEE7EE68874218c3558b40063c42B82D3E7232a
 * On testnet: uses MockRouter (same ABI, mints output tokens at 1:1 rate)
 *
 * Functions:
 * - getSwapQuote(tokenIn, tokenOut, amount) — expected output without executing
 * - swapTokens(params) — execute a swap, return tx hash
 */

import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { getMantleWallet, mantlePublic, txUrl } from '@/lib/mantle';
import {
  ERC20_ABI,
  MOE_ROUTER_ABI,
  MOCK_ROUTER_ABI,
  TOKENS,
  CONTRACTS,
} from '@/lib/contracts';
import { NETWORK } from '@/agent/config';
import { ensureApproval } from '@/agent/wallet';
import type { SwapResult } from '@/lib/types';

const TOKEN_DECIMALS: Record<string, number> = {
  MNT: 18,
  WMNT: 18,
  WETH: 18,
  mETH: 18,
  USDC: 6,
  USDT: 6,
};

// ============================================================
// QUOTE
// ============================================================

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: number
): Promise<{
  amountIn: number;
  amountOut: number;
  priceImpactPct: number;
  path: `0x${string}`[];
}> {
  const tokenInAddress = TOKENS[tokenIn as keyof typeof TOKENS];
  const tokenOutAddress = TOKENS[tokenOut as keyof typeof TOKENS];

  if (!tokenInAddress || !tokenOutAddress) {
    throw new Error(`Unknown token: ${tokenIn} or ${tokenOut}`);
  }

  const decimalsIn = TOKEN_DECIMALS[tokenIn] ?? 18;
  const amountInWei = parseUnits(amountIn.toString(), decimalsIn);

  const path: `0x${string}`[] = [tokenInAddress, tokenOutAddress];
  const routerAddress = CONTRACTS.merchantMoeRouter;
  const routerAbi = NETWORK === 'mainnet' ? MOE_ROUTER_ABI : MOCK_ROUTER_ABI;

  try {
    const amounts = await mantlePublic.readContract({
      address: routerAddress,
      abi: routerAbi,
      functionName: 'getAmountsOut',
      args: [amountInWei, path],
    }) as bigint[];

    const decimalsOut = TOKEN_DECIMALS[tokenOut] ?? 18;
    const amountOut = Number(formatUnits(amounts[amounts.length - 1], decimalsOut));

    // Simple price impact estimate
    const priceImpactPct = amountIn > 100 ? 0.3 : 0.1;

    return { amountIn, amountOut, priceImpactPct, path };
  } catch {
    // MockRouter not deployed yet — return simulated quote
    const amountOut = amountIn * getMockExchangeRate(tokenIn, tokenOut);
    return { amountIn, amountOut, priceImpactPct: 0.1, path };
  }
}

// ============================================================
// EXECUTE SWAP
// ============================================================

export async function swapTokens(params: {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippagePercent?: number;
}): Promise<SwapResult> {
  const { wallet, account } = getMantleWallet();
  const routerAddress = CONTRACTS.merchantMoeRouter;
  const routerAbi = NETWORK === 'mainnet' ? MOE_ROUTER_ABI : MOCK_ROUTER_ABI;

  // Zero address = mock contracts not deployed yet
  if (routerAddress === '0x0000000000000000000000000000000000000000') {
    return simulateSwap(params);
  }

  const tokenInAddress = TOKENS[params.tokenIn as keyof typeof TOKENS];
  const tokenOutAddress = TOKENS[params.tokenOut as keyof typeof TOKENS];
  const decimalsIn = TOKEN_DECIMALS[params.tokenIn] ?? 18;
  const decimalsOut = TOKEN_DECIMALS[params.tokenOut] ?? 18;
  const slippage = params.slippagePercent ?? 1;

  const amountInWei = parseUnits(params.amount.toString(), decimalsIn);

  // Get expected output
  const quote = await getSwapQuote(params.tokenIn, params.tokenOut, params.amount);
  const expectedOut = parseUnits(quote.amountOut.toString(), decimalsOut);
  const minOut = (expectedOut * BigInt(Math.floor((100 - slippage) * 100))) / 10000n;

  try {
    // Step 1: Approve router to spend tokenIn
    await ensureApproval(tokenInAddress, routerAddress, amountInWei);

    // Step 2: Execute swap
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min
    const txHash = await wallet.writeContract({
      address: routerAddress,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokens',
      args: [amountInWei, minOut, [tokenInAddress, tokenOutAddress], account.address, deadline],
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash: txHash });

    return {
      success: receipt.status === 'success',
      txHash,
      explorerUrl: txUrl(txHash),
      data: {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amount,
        amountOut: quote.amountOut,
        priceImpactPct: quote.priceImpactPct,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Swap failed',
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

function getMockExchangeRate(tokenIn: string, tokenOut: string): number {
  const prices: Record<string, number> = {
    MNT: 0.8, WMNT: 0.8, USDC: 1, USDT: 1, WETH: 2500, mETH: 2600
  };
  const priceIn = prices[tokenIn] ?? 1;
  const priceOut = prices[tokenOut] ?? 1;
  return priceIn / priceOut;
}

/**
 * Encode swapExactTokensForTokens calldata for vault execution.
 * This encodes the function call but does NOT submit it — the vault
 * will call this as the `data` parameter to vault.execute().
 *
 * Queries the router's getAmountsOut on-chain to compute minOut,
 * ensuring the minOut always matches what the router will actually
 * return (avoids INSUFFICIENT_OUTPUT_AMOUNT reverts).
 */
export async function encodeSwapData(params: {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippagePercent?: number;
  recipient: `0x${string}`; // Who receives the output tokens (vault address)
}): Promise<`0x${string}`> {
  const tokenInAddress = TOKENS[params.tokenIn as keyof typeof TOKENS];
  const tokenOutAddress = TOKENS[params.tokenOut as keyof typeof TOKENS];
  const decimalsIn = TOKEN_DECIMALS[params.tokenIn] ?? 18;
  const slippage = params.slippagePercent ?? 1;

  const amountInWei = parseUnits(params.amount.toString(), decimalsIn);
  const path: `0x${string}`[] = [tokenInAddress, tokenOutAddress];
  const routerAddress = CONTRACTS.merchantMoeRouter;
  const routerAbi = NETWORK === 'mainnet' ? MOE_ROUTER_ABI : MOCK_ROUTER_ABI;

  // Query the router for the actual expected output amount.
  // This uses the same formula as swapExactTokensForTokens internally,
  // so the minOut check will always pass (modulo slippage).
  const amounts = await mantlePublic.readContract({
    address: routerAddress,
    abi: routerAbi,
    functionName: 'getAmountsOut',
    args: [amountInWei, path],
  }) as bigint[];

  const expectedOut = amounts[amounts.length - 1];
  // Apply slippage: minOut = expectedOut * (100 - slippage%) / 100
  const minOut = (expectedOut * BigInt(Math.floor((100 - slippage) * 100))) / 10000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min

  return encodeFunctionData({
    abi: routerAbi as any,
    functionName: 'swapExactTokensForTokens',
    args: [amountInWei, minOut, [tokenInAddress, tokenOutAddress], params.recipient, deadline],
  });
}

/**
 * Encode ERC-20 approve calldata (used as a prerequisite vault call).
 */
export function encodeApproveData(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI as any,
    functionName: 'approve',
    args: [spender, amount],
  });
}

function simulateSwap(params: {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippagePercent?: number;
}): SwapResult {
  const amountOut = params.amount * getMockExchangeRate(params.tokenIn, params.tokenOut);
  const mockHash = `0x${'ab'.repeat(32)}` as `0x${string}`;
  return {
    success: true,
    txHash: mockHash,
    explorerUrl: '#',
    data: {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amount,
      amountOut,
      priceImpactPct: 0.1,
    },
  };
}
