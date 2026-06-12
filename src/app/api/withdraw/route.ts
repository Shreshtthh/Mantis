/**
 * Withdraw API — sends funds from agent wallet → user's connected address.
 * POST { token, amount, toAddress }
 *
 * Guardrails: validates address format, checks balance, logs to SQLite, triggers audit.
 */

import { NextResponse } from 'next/server';
import { parseUnits } from 'viem';
import { getMantleWallet, mantlePublic, txUrl, getAgentAddress } from '@/lib/mantle';
import { ERC20_ABI, TOKENS } from '@/lib/contracts';
import { logDeposit } from '@/lib/db';
import { audit } from '@/agent/auditor';

export const runtime = 'nodejs';

const TOKEN_DECIMALS: Record<string, number> = {
  MNT: 18, WMNT: 18, WETH: 18, mETH: 18, USDC: 6, USDT: 6,
};

export async function POST(req: Request) {
  try {
    const { token, amount, toAddress } = await req.json();

    // Validate inputs
    if (!token || !amount || !toAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: token, amount, toAddress' },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address' },
        { status: 400 }
      );
    }

    const { wallet, account } = getMantleWallet();
    const agentAddress = getAgentAddress();

    let txHash: `0x${string}`;

    if (token === 'MNT') {
      // Native MNT transfer
      const balance = await mantlePublic.getBalance({ address: agentAddress });
      const amountWei = parseUnits(amount.toString(), 18);

      if (balance < amountWei) {
        return NextResponse.json(
          { success: false, error: `Insufficient MNT balance. Have ${(Number(balance) / 1e18).toFixed(4)}, need ${amount}` },
          { status: 400 }
        );
      }

      txHash = await wallet.sendTransaction({
        to: toAddress as `0x${string}`,
        value: amountWei,
      });
    } else {
      // ERC-20 transfer
      const tokenAddress = TOKENS[token as keyof typeof TOKENS];
      if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
        return NextResponse.json(
          { success: false, error: `Unsupported token: ${token}` },
          { status: 400 }
        );
      }

      const decimals = TOKEN_DECIMALS[token] ?? 18;
      const amountWei = parseUnits(amount.toString(), decimals);

      // Check balance
      const balance = await mantlePublic.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [agentAddress],
      }) as bigint;

      if (balance < amountWei) {
        return NextResponse.json(
          { success: false, error: `Insufficient ${token} balance` },
          { status: 400 }
        );
      }

      txHash = await wallet.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, amountWei],
      });
    }

    // Wait for confirmation
    await mantlePublic.waitForTransactionReceipt({ hash: txHash });

    // Log to SQLite
    logDeposit({
      userAddress: toAddress,
      direction: 'withdrawal',
      token,
      amount,
      txHash,
    });

    // Self-audit (non-blocking)
    audit({
      action: 'withdrawFunds',
      actionParams: { token, amount, toAddress },
      result: { success: true, txHash, explorerUrl: txUrl(txHash) },
      messages: [{ role: 'system', content: `User-initiated withdrawal: ${amount} ${token} → ${toAddress}` }],
    }).catch(() => {}); // Never block on audit failure

    return NextResponse.json({
      success: true,
      txHash,
      explorerUrl: txUrl(txHash),
      message: `Withdrew ${amount} ${token} to ${toAddress}`,
    });
  } catch (err) {
    console.error('[withdraw] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Withdrawal failed' },
      { status: 500 }
    );
  }
}
