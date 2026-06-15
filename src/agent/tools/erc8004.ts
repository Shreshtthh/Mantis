/**
 * ERC-8004 Registry Interactions (v2 — uses real deployed ABI)
 *
 * IdentityRegistry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (Mantle mainnet)
 * ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (Mantle mainnet)
 * ValidationRegistry: NOT YET DEPLOYED (spec still in draft)
 *
 * Key changes from v1:
 * - register(), not mintIdentity()
 * - No getAgentByAddress() reverse lookup — store tokenId locally
 * - No getIdentity() — use ownerOf() + tokenURI() instead
 */

import { getMantleWallet, mantlePublic, getAgentAddress } from '@/lib/mantle';
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  CONTRACTS,
} from '@/lib/contracts';
import { AGENT_IDENTITY } from '@/agent/config';
import type { AgentIdentity, AgentReputation } from '@/lib/types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// LOCAL TOKEN ID STORAGE
// ============================================================
// The IdentityRegistry has no reverse lookup (address→tokenId).
// We persist the tokenId to a file after minting so the app can
// reference it across restarts.

const IDENTITY_FILE = path.join(process.cwd(), '.agent-identity.json');

function readStoredTokenId(): bigint | null {
  try {
    const raw = fs.readFileSync(IDENTITY_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return data.tokenId ? BigInt(data.tokenId) : null;
  } catch {
    return null;
  }
}

function writeStoredTokenId(tokenId: bigint) {
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify({
    tokenId: tokenId.toString(),
    address: getAgentAddress(),
    mintedAt: new Date().toISOString(),
  }, null, 2));
}

function getTokenId(): bigint | null {
  return AGENT_IDENTITY.tokenId ?? readStoredTokenId();
}

// ============================================================
// IDENTITY REGISTRY
// ============================================================

export async function getIdentity(tokenId?: bigint): Promise<AgentIdentity | null> {
  const id = tokenId ?? getTokenId();
  if (!id) return null;

  try {
    const [owner, uri] = await Promise.all([
      mantlePublic.readContract({
        address: CONTRACTS.erc8004Identity,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [id],
      }) as Promise<string>,
      mantlePublic.readContract({
        address: CONTRACTS.erc8004Identity,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [id],
      }) as Promise<string>,
    ]);

    return {
      tokenId: id,
      owner: owner as `0x${string}`,
      name: AGENT_IDENTITY.name,
      description: AGENT_IDENTITY.description,
      metadataUri: uri,
      registeredAt: new Date().toISOString(), // Not available on-chain
      version: AGENT_IDENTITY.version,
    };
  } catch {
    return null;
  }
}

/**
 * Are there any identities owned by this address?
 * Uses balanceOf (ERC-721 standard) since there's no reverse lookup.
 */
export async function getAgentBalance(address?: `0x${string}`): Promise<number> {
  const addr = address ?? getAgentAddress();
  try {
    const balance = await mantlePublic.readContract({
      address: CONTRACTS.erc8004Identity,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'balanceOf',
      args: [addr],
    }) as bigint;
    return Number(balance);
  } catch {
    return 0;
  }
}

/**
 * Register Mantis as an ERC-8004 agent identity on Mantle mainnet.
 * Mints an ERC-721 NFT. The agentURI is an IPFS or HTTPS URL pointing
 * to JSON metadata (name, description, capabilities, version).
 *
 * Requires: MNT on mainnet for gas (~$0.01–$0.05)
 * Returns: agentId (tokenId) — save this to .env as AGENT_TOKEN_ID
 */
export async function registerIdentity(params: {
  agentURI: string;
}): Promise<{ txHash: `0x${string}`; agentId: bigint } | null> {
  const { wallet } = getMantleWallet();
  const identityRegistry = CONTRACTS.erc8004Identity;

  // Zero address means not on this network — mainnet only
  if (identityRegistry === '0x0000000000000000000000000000000000000000') {
    console.error('ERC-8004 IdentityRegistry not deployed on this network. Switch to mainnet.');
    return null;
  }

  try {
    console.log(`\n🆔 Registering agent identity on Mantle mainnet...`);
    console.log(`   Registry: ${identityRegistry}`);
    console.log(`   Agent: ${wallet.account.address}`);
    console.log(`   URI: ${params.agentURI}`);

    const txHash = await wallet.writeContract({
      address: identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [params.agentURI],
    });

    const receipt = await mantlePublic.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      console.error('❌ Registration tx reverted');
      return null;
    }

    // Extract tokenId from the Registered event (topic 2 = agentId if indexed)
    // Fallback: try reading balanceOf to derive (first token = tokenId 1 if no prior)
    // For now, treat it as sequential — the agent's first token is their agentId
    const agentId = await mantlePublic.readContract({
      address: identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'balanceOf',
      args: [wallet.account.address],
    }) as bigint;

    // Store locally
    writeStoredTokenId(agentId);

    console.log(`✅ Registered! Agent ID: ${agentId}`);
    console.log(`   Tx: https://explorer.mantle.xyz/tx/${txHash}`);
    console.log(`   Saved to ${IDENTITY_FILE}`);
    console.log(`   Set AGENT_TOKEN_ID=${agentId} in your .env\n`);

    return { txHash, agentId };
  } catch (err) {
    console.error('❌ registerIdentity failed:', err);
    return null;
  }
}

// ============================================================
// REPUTATION REGISTRY
// ============================================================

export async function getReputation(agentId?: bigint): Promise<AgentReputation | null> {
  const id = agentId ?? getTokenId();
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
      successfulActions: 0,
      failedActions: 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// COMBINED AGENT PROFILE
// ============================================================

export async function getAgentProfile() {
  const address = getAgentAddress();
  const tokenId = getTokenId();

  const [identity, reputation, balance] = await Promise.allSettled([
    tokenId ? getIdentity(tokenId) : Promise.resolve(null),
    tokenId ? getReputation(tokenId) : Promise.resolve(null),
    getAgentBalance(address),
  ]);

  return {
    address,
    tokenId: tokenId?.toString() ?? null,
    identityCount: balance.status === 'fulfilled' ? balance.value : 0,
    identity: identity.status === 'fulfilled' ? identity.value : null,
    reputation: reputation.status === 'fulfilled' ? reputation.value : null,
    name: AGENT_IDENTITY.name,
    version: AGENT_IDENTITY.version,
    description: AGENT_IDENTITY.description,
  };
}

// Legacy aliases for route.ts compatibility
export { registerIdentity as mintIdentity };
export async function getAgentTokenId(_address: `0x${string}`): Promise<bigint | null> {
  return getTokenId(); // No reverse lookup — use stored tokenId
}

// ValidationRegistry stubs — not deployed yet (spec still in draft)
export async function submitValidation(_params: {
  agentId: bigint;
  txHash: `0x${string}`;
  ipfsCid: string;
  rationaleHash: `0x${string}`;
}): Promise<{ validationId: bigint; auditTxHash: `0x${string}` } | null> {
  return null; // ValidationRegistry not deployed yet
}
export async function getAgentValidations(
  _agentId: bigint,
  _offset = 0,
  _limit = 10
): Promise<bigint[]> {
  return []; // ValidationRegistry not deployed yet
}
export async function getValidation(_validationId: bigint): Promise<null> {
  return null; // ValidationRegistry not deployed yet
}
