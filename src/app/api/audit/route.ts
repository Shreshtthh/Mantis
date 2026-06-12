/**
 * Audit Trail API — returns recent ERC-8004 Validation Registry entries
 */

import { NextResponse } from 'next/server';
import { getAgentValidations, getValidation } from '@/agent/tools/erc8004';
import { getAuditEntry } from '@/agent/auditor';
import { getRecentActions } from '@/lib/db';
import { AGENT_IDENTITY } from '@/agent/config';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 20);
  const source = searchParams.get('source') ?? 'local'; // 'local' | 'chain'

  try {
    if (source === 'chain' && AGENT_IDENTITY.tokenId) {
      // Read from ERC-8004 Validation Registry
      const validationIds = await getAgentValidations(AGENT_IDENTITY.tokenId, 0, limit);
      const entries = await Promise.all(
        validationIds.map(async (id) => {
          const validation = await getValidation(id);
          if (!validation) return null;

          // Also fetch the IPFS rationale
          const rationale = await getAuditEntry(validation.ipfsCid);
          return { ...validation, rationale };
        })
      );

      return NextResponse.json({
        success: true,
        source: 'chain',
        entries: entries.filter(Boolean),
      });
    } else {
      // Read from local SQLite (faster, always available)
      const actions = getRecentActions(limit);
      return NextResponse.json({
        success: true,
        source: 'local',
        entries: actions.filter((a) => a.audit_ipfs_cid),
      });
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
