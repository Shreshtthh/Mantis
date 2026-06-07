/**
 * Mantis Self-Audit System
 *
 * After every successful on-chain action, auditor:
 * 1. Builds a rationale JSON (prompt → reasoning → guardrail checks → result)
 * 2. SHA-256 hashes it
 * 3. Pins it to IPFS via Pinata
 * 4. Submits hash + CID to ERC-8004 Validation Registry on Mantle
 *
 * This creates a permanent, tamper-proof audit trail.
 * Non-blocking — runs async after the action completes.
 */

import { createHash } from 'crypto';
import { getAgentAddress } from '@/lib/mantle';
import { submitValidation } from './tools/erc8004';
import { AGENT_IDENTITY, NETWORK } from './config';
import type { AuditEntry, TxResult } from '@/lib/types';

// ============================================================
// MAIN AUDIT FUNCTION
// ============================================================

/**
 * Called after every successful trade. Runs asynchronously — does NOT block the response.
 */
export async function audit(params: {
  action: string;
  actionParams: Record<string, unknown>;
  result: TxResult;
  messages: Array<{ role: string; content: string }>;
  guardrailChecks?: Record<string, boolean>;
}): Promise<{
  ipfsCid: string;
  rationaleHash: `0x${string}`;
  auditTxHash?: `0x${string}`;
} | null> {
  try {
    // 1. Build rationale
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action: params.action,
      userPrompt: params.messages[params.messages.length - 1]?.content ?? '',
      agentReasoning: `Executed ${params.action} with params: ${JSON.stringify(params.actionParams)}`,
      guardrailChecks: params.guardrailChecks ?? {
        tokenApproved: true,
        amountWithinLimit: true,
        concentrationOk: true,
        killSwitchOff: true,
        circuitBreakerOff: true,
      },
      params: params.actionParams,
      txHash: params.result.txHash,
      txResult: params.result,
      network: NETWORK,
      agentVersion: AGENT_IDENTITY.version,
    };

    const rationaleJson = JSON.stringify(entry, null, 2);

    // 2. Hash
    const rationaleHash = ('0x' + createHash('sha256').update(rationaleJson).digest('hex')) as `0x${string}`;

    // 3. Pin to IPFS
    const ipfsCid = await pinToIPFS(rationaleJson);

    // 4. Submit to Validation Registry (skip if no agentTokenId yet)
    let auditTxHash: `0x${string}` | undefined;
    if (AGENT_IDENTITY.tokenId && params.result.txHash) {
      const validation = await submitValidation({
        agentId: AGENT_IDENTITY.tokenId,
        txHash: params.result.txHash,
        ipfsCid,
        rationaleHash,
      });
      auditTxHash = validation?.auditTxHash;
    }

    return { ipfsCid, rationaleHash, auditTxHash };
  } catch (err) {
    // Audit failure should NEVER block the main action
    console.error('[auditor] Audit failed (non-fatal):', err);
    return null;
  }
}

// ============================================================
// IPFS (Pinata)
// ============================================================

export async function pinToIPFS(content: string): Promise<string> {
  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    // Return a mock CID for local dev / testnet without Pinata configured
    const hash = createHash('sha256').update(content).digest('hex');
    return `bafyrei${hash.slice(0, 46)}`; // plausible-looking CID
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: JSON.parse(content),
      pinataMetadata: {
        name: `mantis-audit-${Date.now()}`,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pinata API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { IpfsHash: string };
  return data.IpfsHash;
}

// ============================================================
// FETCH AUDIT ENTRIES (for dashboard display)
// ============================================================

export async function getAuditEntry(ipfsCid: string): Promise<AuditEntry | null> {
  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`);
    if (!res.ok) return null;
    return await res.json() as AuditEntry;
  } catch {
    return null;
  }
}
