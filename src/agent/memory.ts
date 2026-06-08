/**
 * Mantis Agent Memory (SQLite-backed)
 *
 * Provides:
 * - saveMessage() — persist a chat message
 * - getContextMessages() — retrieve recent messages for LLM context window
 * - logAction() — log a tool call and its result
 * - getActionHistory() — retrieve past actions
 */

import { randomUUID } from 'crypto';
import {
  saveMessage as dbSaveMessage,
  getSessionMessages,
  logAction as dbLogAction,
  getRecentActions,
} from '@/lib/db';
import type { TxResult } from '@/lib/types';

// ============================================================
// MESSAGES
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function persistMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  toolName?: string,
  toolResult?: string
) {
  dbSaveMessage({
    id: randomUUID(),
    sessionId,
    role,
    content,
    toolName,
    toolResult,
  });
}

/**
 * Get recent messages for this session, formatted for the AI SDK's messages array.
 * Returns at most `limit` messages, oldest first.
 */
export function getContextMessages(sessionId: string, limit = 20): ChatMessage[] {
  const rows = getSessionMessages(sessionId, limit) as Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
  }>;

  // Filter to just user/assistant for the LLM context (tool messages are internal)
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
}

// ============================================================
// ACTION LOG
// ============================================================

export function recordAction(params: {
  sessionId: string;
  action: string;
  params: Record<string, unknown>;
  result: TxResult;
  guardrailChecks?: Record<string, boolean>;
  txHash?: string;
  auditIpfsCid?: string;
  auditTxHash?: string;
}) {
  dbLogAction({
    id: randomUUID(),
    sessionId: params.sessionId,
    action: params.action,
    params: params.params,
    result: params.result as unknown as Record<string, unknown>,
    guardrailChecks: params.guardrailChecks ?? {},
    txHash: params.txHash,
    auditIpfsCid: params.auditIpfsCid,
    auditTxHash: params.auditTxHash,
  });
}

export function getActionHistory(limit = 20) {
  return getRecentActions(limit);
}
