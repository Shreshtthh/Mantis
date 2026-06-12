/**
 * SQLite database setup — agent memory and action log
 *
 * Tables:
 * - conversations  — chat message history (for context window)
 * - actions        — every tool call the agent executes (with result)
 * - audit_entries  — IPFS CID + Validation Registry tx (self-audit trail)
 * - circuit_breaker — persistent guardrail state
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'mantis.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
      content     TEXT NOT NULL,
      tool_name   TEXT,
      tool_result TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_session
      ON conversations(session_id, created_at);

    CREATE TABLE IF NOT EXISTS actions (
      id              TEXT PRIMARY KEY,
      session_id      TEXT NOT NULL,
      action          TEXT NOT NULL,
      params          TEXT NOT NULL,  -- JSON
      result          TEXT NOT NULL,  -- JSON
      guardrail_checks TEXT NOT NULL, -- JSON
      tx_hash         TEXT,
      audit_ipfs_cid  TEXT,
      audit_tx_hash   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_actions_session
      ON actions(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_actions_type
      ON actions(action, created_at);

    CREATE TABLE IF NOT EXISTS audit_entries (
      id               TEXT PRIMARY KEY,
      action_id        TEXT NOT NULL REFERENCES actions(id),
      ipfs_cid         TEXT NOT NULL,
      rationale_hash   TEXT NOT NULL,
      validation_tx    TEXT,
      validation_id    TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS circuit_breaker (
      id                    INTEGER PRIMARY KEY CHECK (id = 1), -- singleton
      is_tripped            INTEGER NOT NULL DEFAULT 0,
      reason                TEXT,
      tripped_at            TEXT,
      consecutive_losses    INTEGER NOT NULL DEFAULT 0,
      daily_loss_usd        REAL NOT NULL DEFAULT 0,
      daily_loss_reset_at   TEXT NOT NULL DEFAULT (date('now')),
      kill_switch_engaged   INTEGER NOT NULL DEFAULT 0,
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Initialize the circuit breaker singleton row if it doesn't exist
    INSERT OR IGNORE INTO circuit_breaker (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS deposits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      direction   TEXT NOT NULL CHECK (direction IN ('deposit', 'withdrawal')),
      token       TEXT NOT NULL,
      amount      REAL NOT NULL,
      tx_hash     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deposits_user
      ON deposits(user_address, created_at);
  `);

  return _db;
}

// ============================================================
// CONVERSATION HELPERS
// ============================================================

export function saveMessage(params: {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolResult?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO conversations (id, session_id, role, content, tool_name, tool_result)
    VALUES (@id, @sessionId, @role, @content, @toolName, @toolResult)
  `).run({
    id: params.id,
    sessionId: params.sessionId,
    role: params.role,
    content: params.content,
    toolName: params.toolName ?? null,
    toolResult: params.toolResult ?? null,
  });
}

export function getSessionMessages(sessionId: string, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM conversations
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, limit).reverse();
}

// ============================================================
// ACTION LOG HELPERS
// ============================================================

export function logAction(params: {
  id: string;
  sessionId: string;
  action: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  guardrailChecks: Record<string, boolean>;
  txHash?: string;
  auditIpfsCid?: string;
  auditTxHash?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO actions (
      id, session_id, action, params, result, guardrail_checks,
      tx_hash, audit_ipfs_cid, audit_tx_hash
    ) VALUES (
      @id, @sessionId, @action, @params, @result, @guardrailChecks,
      @txHash, @auditIpfsCid, @auditTxHash
    )
  `).run({
    id: params.id,
    sessionId: params.sessionId,
    action: params.action,
    params: JSON.stringify(params.params),
    result: JSON.stringify(params.result),
    guardrailChecks: JSON.stringify(params.guardrailChecks),
    txHash: params.txHash ?? null,
    auditIpfsCid: params.auditIpfsCid ?? null,
    auditTxHash: params.auditTxHash ?? null,
  });
}

export function getRecentActions(limit = 20) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM actions
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    session_id: string;
    action: string;
    params: string;
    result: string;
    guardrail_checks: string;
    tx_hash: string | null;
    audit_ipfs_cid: string | null;
    audit_tx_hash: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    ...row,
    params: JSON.parse(row.params),
    result: JSON.parse(row.result),
    guardrailChecks: JSON.parse(row.guardrail_checks),
  }));
}

// ============================================================
// CIRCUIT BREAKER STATE
// ============================================================

export interface CircuitBreakerRow {
  isTripped: boolean;
  reason: string | null;
  trippedAt: string | null;
  consecutiveLosses: number;
  dailyLossUsd: number;
  killSwitchEngaged: boolean;
}

export function getCircuitBreakerState(): CircuitBreakerRow {
  const db = getDb();
  const row = db.prepare('SELECT * FROM circuit_breaker WHERE id = 1').get() as {
    is_tripped: number;
    reason: string | null;
    tripped_at: string | null;
    consecutive_losses: number;
    daily_loss_usd: number;
    daily_loss_reset_at: string;
    kill_switch_engaged: number;
  };

  // Reset daily loss if it's a new day
  const today = new Date().toISOString().split('T')[0];
  if (row.daily_loss_reset_at !== today) {
    db.prepare(`
      UPDATE circuit_breaker
      SET daily_loss_usd = 0, daily_loss_reset_at = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(today);
    row.daily_loss_usd = 0;
  }

  return {
    isTripped: Boolean(row.is_tripped),
    reason: row.reason,
    trippedAt: row.tripped_at,
    consecutiveLosses: row.consecutive_losses,
    dailyLossUsd: row.daily_loss_usd,
    killSwitchEngaged: Boolean(row.kill_switch_engaged),
  };
}

export function updateCircuitBreaker(updates: Partial<{
  isTripped: boolean;
  reason: string;
  trippedAt: string;
  consecutiveLosses: number;
  dailyLossUsd: number;
  killSwitchEngaged: boolean;
}>) {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: Record<string, unknown> = {};

  if (updates.isTripped !== undefined) {
    sets.push('is_tripped = @isTripped');
    values.isTripped = updates.isTripped ? 1 : 0;
  }
  if (updates.reason !== undefined) {
    sets.push('reason = @reason');
    values.reason = updates.reason;
  }
  if (updates.trippedAt !== undefined) {
    sets.push('tripped_at = @trippedAt');
    values.trippedAt = updates.trippedAt;
  }
  if (updates.consecutiveLosses !== undefined) {
    sets.push('consecutive_losses = @consecutiveLosses');
    values.consecutiveLosses = updates.consecutiveLosses;
  }
  if (updates.dailyLossUsd !== undefined) {
    sets.push('daily_loss_usd = @dailyLossUsd');
    values.dailyLossUsd = updates.dailyLossUsd;
  }
  if (updates.killSwitchEngaged !== undefined) {
    sets.push('kill_switch_engaged = @killSwitchEngaged');
    values.killSwitchEngaged = updates.killSwitchEngaged ? 1 : 0;
  }

  db.prepare(`UPDATE circuit_breaker SET ${sets.join(', ')} WHERE id = 1`).run(values);
}

export function engageKillSwitch(reason: string) {
  updateCircuitBreaker({
    killSwitchEngaged: true,
    isTripped: true,
    reason,
    trippedAt: new Date().toISOString(),
  });
}

export function resetCircuitBreaker() {
  const db = getDb();
  db.prepare(`
    UPDATE circuit_breaker SET
      is_tripped = 0,
      reason = NULL,
      tripped_at = NULL,
      consecutive_losses = 0,
      kill_switch_engaged = 0,
      updated_at = datetime('now')
    WHERE id = 1
  `).run();
}

// ============================================================
// DEPOSIT / WITHDRAWAL LOG
// ============================================================

export function logDeposit(params: {
  userAddress: string;
  direction: 'deposit' | 'withdrawal';
  token: string;
  amount: number;
  txHash?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO deposits (user_address, direction, token, amount, tx_hash)
    VALUES (@userAddress, @direction, @token, @amount, @txHash)
  `).run({
    userAddress: params.userAddress,
    direction: params.direction,
    token: params.token,
    amount: params.amount,
    txHash: params.txHash ?? null,
  });
}

export function getDepositHistory(userAddress?: string, limit = 20) {
  const db = getDb();
  if (userAddress) {
    return db.prepare(`
      SELECT * FROM deposits
      WHERE user_address = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userAddress, limit) as Array<{
      id: number;
      user_address: string;
      direction: string;
      token: string;
      amount: number;
      tx_hash: string | null;
      created_at: string;
    }>;
  }
  return db.prepare(`
    SELECT * FROM deposits
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    user_address: string;
    direction: string;
    token: string;
    amount: number;
    tx_hash: string | null;
    created_at: string;
  }>;
}

