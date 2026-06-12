/**
 * Shared TypeScript interfaces for Mantis
 */

// ============================================================
// TRANSACTION RESULTS
// ============================================================

export interface TxResult {
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
  explorerUrl?: string;
  // Action-specific data
  data?: Record<string, unknown>;
}

export interface SwapResult extends TxResult {
  data?: {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    priceImpactPct: number;
  };
}

export interface LendleDepositResult extends TxResult {
  data?: {
    token: string;
    amount: number;
    apy: number;
    aTokenReceived: number;
  };
}

export interface PerpsPositionResult extends TxResult {
  data?: {
    positionId: string;
    market: string;
    side: 'long' | 'short';
    sizeUsd: number;
    leverage: number;
    entryPrice: number;
    liquidationPrice: number;
  };
}

// ============================================================
// GUARDRAIL TYPES
// ============================================================

export interface GuardrailCheck {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
  preview?: Record<string, unknown>;
}

export interface CircuitBreakerState {
  isTripped: boolean;
  reason?: string;
  trippedAt?: string;
  consecutiveLosses: number;
  dailyLossUsd: number;
  killSwitchEngaged: boolean;
}

// ============================================================
// AGENT MEMORY / AUDIT
// ============================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
  sessionId: string;
}

export interface ActionLog {
  id: string;
  sessionId: string;
  action: string;
  params: Record<string, unknown>;
  result: TxResult;
  guardrailChecks: Record<string, boolean>;
  auditIpfsCid?: string;
  auditTxHash?: `0x${string}`;
  createdAt: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  userPrompt: string;
  agentReasoning: string;
  guardrailChecks: Record<string, boolean>;
  params: Record<string, unknown>;
  txHash?: string;
  txResult: TxResult;
  network: string;
  agentVersion: string;
}

// ============================================================
// PORTFOLIO / BALANCE TYPES
// ============================================================

export interface TokenBalance {
  symbol: string;
  address: string;
  balance: bigint;
  balanceFormatted: number;
  valueUsd: number;
}

export interface WalletBalance {
  mantleTreasury: {
    address: string;
    tokens: TokenBalance[];
    totalValueUsd: number;
    nativeBalance: bigint;
  };
  byrealAccount?: {
    address: string;
    margin: number;
    equity: number;
    unrealizedPnl: number;
    leverage: number;
  };
}

export interface LendlePosition {
  token: string;
  supplied: number;
  supplyApy: number;
  valueUsd: number;
  aTokenAddress: string;
}

export interface PerpsPosition {
  positionId: string;
  market: string;
  side: 'long' | 'short';
  sizeUsd: number;
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  liquidationPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: string;
}

export interface Portfolio {
  wallet: WalletBalance;
  lendlePositions: LendlePosition[];
  perpsPositions: PerpsPosition[];
  totalValueUsd: number;
  totalPnlUsd: number;
}

// ============================================================
// ERC-8004 TYPES
// ============================================================

export interface AgentIdentity {
  tokenId: bigint;
  owner: `0x${string}`;
  name: string;
  description: string;
  version: string;
  metadataUri: string;
  registeredAt: string;
}

export interface AgentReputation {
  agentId: bigint;
  score: number; // 0-100
  totalRatings: number;
  successfulActions: number;
  failedActions: number;
}

export interface ValidationEntry {
  validationId: bigint;
  agentId: bigint;
  txHash: `0x${string}`;
  ipfsCid: string;
  rationaleHash: `0x${string}`;
  timestamp: string;
}

// ============================================================
// YIELD DATA
// ============================================================

export interface YieldData {
  protocol: string;
  token: string;
  supplyApy: number;
  borrowApy?: number;
  tvlUsd?: number;
  utilization?: number;
  source: 'lendle' | 'mock' | 'external';
}

// ============================================================
// DEPOSIT / WITHDRAWAL TRACKING (Phase 1 — Hybrid Wallet)
// ============================================================

export interface DepositRecord {
  id: number;
  userAddress: string;
  direction: 'deposit' | 'withdrawal';
  token: string;
  amount: number;
  txHash?: string;
  createdAt: string;
}

// ============================================================
// BYREAL PERPS — ORDERS & POSITIONS (Phase 2)
// ============================================================

export interface PerpsOrder {
  orderId: string;
  market: string;
  side: 'long' | 'short';
  type: 'market' | 'limit';
  sizeUsd: number;
  price?: number;
  leverage: number;
  tp?: number;
  sl?: number;
  status: 'open' | 'filled' | 'cancelled';
  createdAt: string;
}

// ============================================================
// MARKET SIGNALS (Phase 3 — Alpha Engine)
// ============================================================

export interface MarketSignal {
  coin: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  fundingRate: number;
  priceChange24h: number;
  volume24h: number;
  timestamp: string;
}

export interface SignalDetail {
  coin: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  indicators: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    ema20: number;
    ema50: number;
    vwap: number;
  };
  support: number;
  resistance: number;
  fundingRate: number;
  openInterest: number;
  recommendation: string;
}

// ============================================================
// SMART MONEY (Phase 3 — Alpha Engine)
// ============================================================

export interface WhaleTransfer {
  txHash: string;
  from: string;
  to: string;
  token: string;
  amount: number;
  valueUsd: number;
  timestamp: string;
  label?: string; // known wallet label
}

// ============================================================
// STRATEGY PROPOSALS (Phase 3 — Alpha Engine)
// ============================================================

export interface StrategyProposal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  proposal: string;
  reasoning: string[];
  risks: string[];
  suggestedAction?: {
    tool: string;
    params: Record<string, unknown>;
  };
  timestamp: string;
}

// ============================================================
// CONNECTED WALLET (Frontend — Phase 1)
// ============================================================

export interface ConnectedWallet {
  address: `0x${string}`;
  chainId: number;
  isCorrectChain: boolean;
}
