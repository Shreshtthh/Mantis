/**
 * AgentVault Client
 *
 * Wraps all interactions with the AgentVault smart contract on Mantle.
 *
 * Architecture:
 *   Agent EOA → vault.execute(target, value, data, valueUsd, rationaleCid)
 *   User EOA → vault.requestWithdrawal(token) → wait → vault.executeWithdrawal()
 *
 * The agent NEVER touches user funds directly. Every trade goes through
 * the vault, which enforces on-chain guardrails (per-trade and daily limits).
 *
 * Deployed: 0x8533C45FE0686fD32b290dCe4be92FE54b6808d6 (Mantle Sepolia)
 */

import { getMantleWallet, mantlePublic, getAgentAddress, txUrl } from '@/lib/mantle';
import { config } from '@/agent/config';
import { encodeFunctionData, decodeEventLog, parseAbi, getAddress } from 'viem';
import type { TxResult } from '@/lib/types';

// ============================================================
// ABI
// ============================================================

const VAULT_ABI = parseAbi([
  // Read
  'function agent() view returns (address)',
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function maxSingleTradeUsd() view returns (uint256)',
  'function maxDailySpendUsd() view returns (uint256)',
  'function dailySpentUsd() view returns (uint256)',
  'function dailyWindowStart() view returns (uint256)',
  'function withdrawalDelay() view returns (uint256)',
  'function pendingWithdrawal() view returns ((uint256 amount, address token, uint256 unlockAt))',
  // Agent execution
  'function execute(address target, uint256 value, bytes data, uint256 valueUsd, string rationaleCid) returns (bool, bytes)',
  // Owner functions
  'function requestWithdrawal(address token)',
  'function executeWithdrawal()',
  'function cancelWithdrawal()',
  'function setGuardrails(uint256 _maxSingleTradeUsd, uint256 _maxDailySpendUsd)',
  'function pause()',
  'function unpause()',
  // Events
  'event AgentExecuted(address indexed protocol, bytes4 indexed action, uint256 valueUsd, string rationaleCid)',
  'event WithdrawalRequested(address indexed token, uint256 amount, uint256 unlockAt)',
  'event WithdrawalCancelled()',
  'event Paused()',
  'event Unpaused()',
]);

const VAULT_ADDRESS = config.contracts.agentVault as `0x${string}`;

// ============================================================
// READ — vault state
// ============================================================

export interface VaultState {
  address: string;
  agent: string;
  owner: string;
  paused: boolean;
  maxSingleTradeUsd: bigint;
  maxDailySpendUsd: bigint;
  dailySpentUsd: bigint;
  dailyWindowStart: bigint;
  withdrawalDelay: bigint;
  pendingWithdrawal: {
    amount: bigint;
    token: string;
    unlockAt: bigint;
  } | null;
}

export async function getVaultState(): Promise<VaultState> {
  if (VAULT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return {
      address: '0x0000000000000000000000000000000000000000',
      agent: getAgentAddress(),
      owner: getAgentAddress(),
      paused: false,
      maxSingleTradeUsd: 500n,
      maxDailySpendUsd: 2000n,
      dailySpentUsd: 0n,
      dailyWindowStart: 0n,
      withdrawalDelay: 3600n,
      pendingWithdrawal: null,
    };
  }

  const [
    agent,
    owner,
    paused,
    maxSingleTradeUsd,
    maxDailySpendUsd,
    dailySpentUsd,
    dailyWindowStart,
    withdrawalDelay,
    pendingWithdrawal,
  ] = await Promise.all([
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'agent' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'owner' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'paused' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'maxSingleTradeUsd' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'maxDailySpendUsd' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'dailySpentUsd' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'dailyWindowStart' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdrawalDelay' }),
    mantlePublic.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'pendingWithdrawal' }),
  ]);

  const pw = pendingWithdrawal as unknown as [bigint, string, bigint];
  const pwObj = pw[0] > 0n ? { amount: pw[0], token: pw[1], unlockAt: pw[2] } : null;

  return {
    address: VAULT_ADDRESS,
    agent: agent as string,
    owner: owner as string,
    paused: paused as boolean,
    maxSingleTradeUsd: maxSingleTradeUsd as bigint,
    maxDailySpendUsd: maxDailySpendUsd as bigint,
    dailySpentUsd: dailySpentUsd as bigint,
    dailyWindowStart: dailyWindowStart as bigint,
    withdrawalDelay: withdrawalDelay as bigint,
    pendingWithdrawal: pwObj,
  };
}

// ============================================================
// WRITE — agent calls vault.execute()
// ============================================================

export interface VaultExecuteParams {
  /** Target protocol contract (e.g., swap router, lending pool) */
  target: `0x${string}`;
  /** Native token value to send (0 for most ERC-20 operations) */
  value?: bigint;
  /** ABI-encoded function call data */
  data: `0x${string}`;
  /** Estimated USD value of this trade (for on-chain guardrails) */
  valueUsd: number;
  /** IPFS CID of the agent's audit rationale */
  rationaleCid?: string;
}

export interface VaultExecutionResult extends TxResult {
  /** The AgentExecuted event data, if the tx succeeded */
  event?: {
    protocol: string;
    action: string;
    valueUsd: number;
    rationaleCid: string;
    txHash: `0x${string}`;
    explorerUrl: string;
  };
}

export async function vaultExecute(params: VaultExecuteParams): Promise<VaultExecutionResult> {
  if (VAULT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return {
      success: false,
      error: 'AgentVault not deployed. Deploy vault to enable on-chain guardrails.',
    };
  }

  const { wallet, account } = getMantleWallet();
  const value = params.value ?? 0n;
  const valueUsd = BigInt(params.valueUsd);
  const rationaleCid = params.rationaleCid ?? 'ipfs://pending';

  try {
    const hash = await wallet.writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'execute',
      args: [params.target, value, params.data, valueUsd, rationaleCid],
      account, // the agent EOA
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash });
    const success = receipt.status === 'success';

    // Extract AgentExecuted event
    let event;
    if (success) {
      try {
        // Find the AgentExecuted log
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === VAULT_ADDRESS.toLowerCase()) {
            try {
              const decoded = decodeEventLog({
                abi: VAULT_ABI,
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === 'AgentExecuted') {
                const args = decoded.args as any;
                event = {
                  protocol: getAddress(args.protocol),
                  action: args.action,
                  valueUsd: Number(args.valueUsd),
                  rationaleCid: args.rationaleCid,
                  txHash: hash,
                  explorerUrl: txUrl(hash),
                };
                break;
              }
            } catch { /* not our event, skip */ }
          }
        }
      } catch { /* event decoding is best-effort */ }
    }

    return {
      success,
      txHash: hash,
      explorerUrl: txUrl(hash),
      event,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Vault execution failed',
    };
  }
}

// ============================================================
// OWNER ACTIONS — return encoded calldata for user to sign
// ============================================================

/** Encode requestWithdrawal(token) — user signs this from MetaMask */
export function encodeRequestWithdrawal(token: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: VAULT_ABI,
    functionName: 'requestWithdrawal',
    args: [token],
  });
}

/** Encode executeWithdrawal() */
export function encodeExecuteWithdrawal(): `0x${string}` {
  return encodeFunctionData({
    abi: VAULT_ABI,
    functionName: 'executeWithdrawal',
  });
}

/** Encode cancelWithdrawal() */
export function encodeCancelWithdrawal(): `0x${string}` {
  return encodeFunctionData({
    abi: VAULT_ABI,
    functionName: 'cancelWithdrawal',
  });
}

/** Encode pause() */
export function encodePause(): `0x${string}` {
  return encodeFunctionData({ abi: VAULT_ABI, functionName: 'pause' });
}

/** Encode unpause() */
export function encodeUnpause(): `0x${string}` {
  return encodeFunctionData({ abi: VAULT_ABI, functionName: 'unpause' });
}
