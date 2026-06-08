/**
 * ERC-8004 Registry Interactions
 *
 * Reads and writes to all 3 Mantle ERC-8004 registries:
 * - Identity Registry    — agent NFT, metadata
 * - Reputation Registry  — user ratings, score
 * - Validation Registry  — self-audit: rationale hash + IPFS CID
 */

import { getMantleWallet, mantlePublic } from '@/lib/mantle';
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
  CONTRACTS,
} from '@/lib/contracts';
import { AGENT_IDENTITY } from '@/agent/config';
import type { AgentIdentity, AgentReputation, ValidationEntry } from '@/lib/types';

// ============================================================
// IDENTITY REGISTRY
// ============================================================

export async function getIdentity(tokenId?: bigint): Promise<AgentIdentity | null> {
  const id = tokenId ?? AGENT_IDENTITY.tokenId;
  if (!id) return null;

  try {
    const result = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Identity,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getIdentity',
      args: [id],
    }) as [string, string, string, string, bigint];

    return {
      tokenId: id,
      owner: result[0] as `0x${string}`,
      name: result[1],
      description: result[2],
      metadataUri: result[3],
      registeredAt: new Date(Number(result[4]) * 1000).toISOString(),
      version: AGENT_IDENTITY.version,
    };
  } catch {
    return null;
  }
}

export async function getAgentTokenId(address: `0x${string}`): Promise<bigint | null> {
  try {
    const tokenId = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Identity,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentByAddress',
      args: [address],
    }) as bigint;

    return tokenId > 0n ? tokenId : null;
  } catch {
    return null;
  }
}

export async function mintIdentity(params: {
  name: string;
  description: string;
  metadataUri: string;
}): Promise<{ txHash: `0x${string}`; tokenId: bigint } | null> {
  try {
    const { wallet } = getMantleWallet();
    const txHash = await wallet.writeContract({
      address: CONTRACTS.erc8004Identity,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'mintIdentity',
      args: [params.name, params.description, params.metadataUri],
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash: txHash });

    // Extract tokenId from logs (simplified — assumes first log arg is tokenId)
    // In production, decode the Transfer event properly
    const tokenId = 1n; // placeholder — read from event logs in production

    return { txHash, tokenId };
  } catch (err) {
    console.error('mintIdentity failed:', err);
    return null;
  }
}

// ============================================================
// REPUTATION REGISTRY
// ============================================================

export async function getReputation(agentId?: bigint): Promise<AgentReputation | null> {
  const id = agentId ?? AGENT_IDENTITY.tokenId;
  if (!id) return null;

  try {
    const result = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Reputation,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getReputation',
      args: [id],
    }) as [bigint, bigint];

    const score = Number(result[0]);
    const totalRatings = Number(result[1]);

    return {
      agentId: id,
      score,
      totalRatings,
      successfulActions: 0, // Not available directly from registry
      failedActions: 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// VALIDATION REGISTRY (self-audit)
// ============================================================

export async function submitValidation(params: {
  agentId: bigint;
  txHash: `0x${string}`;
  ipfsCid: string;
  rationaleHash: `0x${string}`;
}): Promise<{ validationId: bigint; auditTxHash: `0x${string}` } | null> {
  try {
    const { wallet } = getMantleWallet();

    // Convert txHash to bytes32
    const txHashBytes = params.txHash as `0x${string}`;

    const auditTxHash = await wallet.writeContract({
      address: CONTRACTS.erc8004Validation,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'submitValidation',
      args: [params.agentId, txHashBytes, params.ipfsCid, params.rationaleHash],
    });

    await mantlePublic.waitForTransactionReceipt({ hash: auditTxHash });

    return { validationId: 0n, auditTxHash }; // validationId from event in production
  } catch (err) {
    console.error('submitValidation failed:', err);
    return null;
  }
}

export async function getValidation(validationId: bigint): Promise<ValidationEntry | null> {
  try {
    const result = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Validation,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getValidation',
      args: [validationId],
    }) as [bigint, `0x${string}`, string, `0x${string}`, bigint];

    return {
      validationId,
      agentId: result[0],
      txHash: result[1],
      ipfsCid: result[2],
      rationaleHash: result[3],
      timestamp: new Date(Number(result[4]) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getAgentValidations(
  agentId: bigint,
  offset = 0,
  limit = 10
): Promise<bigint[]> {
  try {
    const ids = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Validation,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getAgentValidations',
      args: [agentId, BigInt(offset), BigInt(limit)],
    }) as bigint[];

    return ids;
  } catch {
    return [];
  }
}

// ============================================================
// COMBINED AGENT PROFILE (for UI display)
// ============================================================

export async function getAgentProfile() {
  const { wallet, account } = getMantleWallet();
  const [tokenId, identity, reputation] = await Promise.allSettled([
    getAgentTokenId(account.address),
    getIdentity(),
    getReputation(),
  ]);

  return {
    address: account.address,
    tokenId: tokenId.status === 'fulfilled' ? tokenId.value?.toString() : null,
    identity: identity.status === 'fulfilled' ? identity.value : null,
    reputation: reputation.status === 'fulfilled' ? reputation.value : null,
    name: AGENT_IDENTITY.name,
    version: AGENT_IDENTITY.version,
    description: AGENT_IDENTITY.description,
  };
}
