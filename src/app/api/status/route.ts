/**
 * Agent Status API v2 — returns wallet, vault state, guardrail state, portfolio, positions.
 * Used by the frontend dashboard for live data.
 */

import { NextResponse } from 'next/server';
import { getWalletBalance } from '@/agent/wallet';
import { getGuardrailStatus } from '@/agent/guardrails';
import { getGasPrice } from '@/agent/tools/mantle-read';
import { listPositions } from '@/agent/tools/byreal-perps';
import { getVaultState } from '@/agent/vault';
import { getAllLendingRates } from '@/agent/tools/lendle';
import { NETWORK } from '@/agent/config';

export const runtime = 'nodejs';
export const revalidate = 30; // 30s cache — enough to not spam CLI, fresh enough for demo

// In-memory cache so CLI calls only fire once per polling cycle
let _cache: { data: any; ts: number } | null = null;
const CACHE_MS = 30_000; // 30 seconds

export async function GET() {
  // Return cached result if fresh — avoids CLI spam from dashboard polling
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return NextResponse.json(_cache.data);

  try {
    const [wallet, guardrailStatus, gasPrice, positions, vaultState, lendingRates] = await Promise.allSettled([
      getWalletBalance(),
      Promise.resolve(getGuardrailStatus()),
      getGasPrice(),
      listPositions(),
      getVaultState(),
      getAllLendingRates(),
    ]);

    // BigInt-safe JSON serialization — viem returns BigInt for balances
    const body = JSON.parse(JSON.stringify({
      success: true,
      network: NETWORK,
      wallet: wallet.status === 'fulfilled' ? wallet.value : null,
      guardrails: guardrailStatus.status === 'fulfilled' ? guardrailStatus.value : null,
      gas: gasPrice.status === 'fulfilled' ? gasPrice.value : null,
      positions: positions.status === 'fulfilled' ? positions.value : [],
      vault: vaultState.status === 'fulfilled' ? vaultState.value : null,
      lendingRates: lendingRates.status === 'fulfilled' ? lendingRates.value : null,
      timestamp: new Date().toISOString(),
    }, (_, v) => typeof v === 'bigint' ? v.toString() : v));

    _cache = { data: body, ts: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
