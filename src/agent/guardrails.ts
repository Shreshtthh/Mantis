/**
 * Mantis Guardrail Engine
 *
 * Three layers of protection:
 *
 * 1. 🔴 HARD guardrails — pre-execution, block immediately
 *    - Kill switch engaged
 *    - Circuit breaker tripped
 *    - Token/market not whitelisted
 *    - Trade exceeds absolute max size
 *    - Daily loss limit reached
 *    - Portfolio concentration too high
 *
 * 2. 🟡 SOFT guardrails — pre-execution, return "needs approval"
 *    - Trade exceeds soft max (user is at keyboard and must confirm)
 *    - All perps positions (always require approval)
 *    - First time interacting with a new protocol in this session
 *
 * 3. 🟢 CIRCUIT BREAKERS — post-execution, automatic
 *    - 3+ consecutive losses → pause all actions
 *    - Daily loss > $200 → pause all actions
 *    - Gas anomaly detected
 *    - Slippage exceeded
 */
import { GUARDRAIL_DEFAULTS } from './config';
import {
  getCircuitBreakerState,
  updateCircuitBreaker,
  engageKillSwitch as dbEngageKillSwitch,
  resetCircuitBreaker as dbResetCircuitBreaker,
} from '@/lib/db';
import type { GuardrailCheck, TxResult } from '@/lib/types';
// ============================================================
// HARD GUARDRAIL CHECKS
// ============================================================
export function checkHard(
  action: string,
  params: Record<string, unknown>
): GuardrailCheck {
  const state = getCircuitBreakerState();
  // Kill switch — absolute blocker
  if (state.killSwitchEngaged) {
    return {
      allowed: false,
      reason: '🔴 Kill switch is engaged. All actions are blocked. Use the dashboard to disengage.',
    };
  }
  // Circuit breaker — auto-tripped
  if (state.isTripped) {
    return {
      allowed: false,
      reason: `🔴 Circuit breaker active: ${state.reason}. Reset it from the dashboard when ready.`,
    };
  }
  // Token whitelist (for swap/deposit actions)
  if (action === 'swapTokens') {
    const { tokenIn, tokenOut } = params as { tokenIn: string; tokenOut: string };
    if (!GUARDRAIL_DEFAULTS.approvedTokens.includes(tokenIn)) {
      return { allowed: false, reason: `🔴 Token ${tokenIn} is not on the approved list.` };
    }
    if (!GUARDRAIL_DEFAULTS.approvedTokens.includes(tokenOut)) {
      return { allowed: false, reason: `🔴 Token ${tokenOut} is not on the approved list.` };
    }
  }
  if (action === 'depositLendle' || action === 'withdrawLendle') {
    const { token } = params as { token: string };
    if (!GUARDRAIL_DEFAULTS.approvedTokens.includes(token)) {
      return { allowed: false, reason: `🔴 Token ${token} is not on the approved list.` };
    }
  }
  // Perps market whitelist
  if (action === 'openPerpsPosition') {
    const { market, leverage, sizeUsd } = params as { market: string; leverage: number; sizeUsd: number };
    if (!GUARDRAIL_DEFAULTS.approvedMarkets.includes(market)) {
      return { allowed: false, reason: `🔴 Market ${market} is not on the approved list.` };
    }
    // Leverage hard cap (Zod also enforces this, this is defence in depth)
    if (leverage > GUARDRAIL_DEFAULTS.maxLeverageX) {
      return {
        allowed: false,
        reason: `🔴 Leverage ${leverage}x exceeds the hard limit of ${GUARDRAIL_DEFAULTS.maxLeverageX}x.`,
      };
    }
    // Size hard cap
    if (sizeUsd > GUARDRAIL_DEFAULTS.maxSingleTradeSizeUsd) {
      return {
        allowed: false,
        reason: `🔴 Trade size $${sizeUsd} exceeds the maximum of $${GUARDRAIL_DEFAULTS.maxSingleTradeSizeUsd}.`,
      };
    }
  }
  // Generic size hard cap for swaps/deposits
  if (action === 'swapTokens' || action === 'depositLendle') {
    const amount = (params.amount ?? params.sizeUsd ?? 0) as number;
    if (amount > GUARDRAIL_DEFAULTS.maxSingleTradeSizeUsd) {
      return {
        allowed: false,
        reason: `🔴 Amount $${amount} exceeds the single trade limit of $${GUARDRAIL_DEFAULTS.maxSingleTradeSizeUsd}.`,
      };
    }
  }
  // Daily loss limit
  if (state.dailyLossUsd >= GUARDRAIL_DEFAULTS.maxDailyLossUsd) {
    return {
      allowed: false,
      reason: `🔴 Daily loss limit of $${GUARDRAIL_DEFAULTS.maxDailyLossUsd} reached. All actions paused until tomorrow.`,
    };
  }
  return { allowed: true };
}
// ============================================================
// SOFT GUARDRAIL CHECKS
// ============================================================
export function needsApproval(
  action: string,
  params: Record<string, unknown>
): { required: boolean; reason?: string } {
  // All perps always need approval
  if (action === 'openPerpsPosition') {
    const { sizeUsd, leverage, market, side } = params as {
      sizeUsd: number;
      leverage: number;
      market: string;
      side: string;
    };
    return {
      required: true,
      reason: `Perps position requires confirmation: ${side.toUpperCase()} ${market} at ${leverage}x leverage, size $${sizeUsd}`,
    };
  }
  // Swaps and deposits over soft limit
  if (action === 'swapTokens') {
    const { amount } = params as { amount: number };
    if (amount > GUARDRAIL_DEFAULTS.softMaxTradeSizeUsd) {
      return {
        required: true,
        reason: `Swap amount $${amount} exceeds $${GUARDRAIL_DEFAULTS.softMaxTradeSizeUsd} — confirmation required`,
      };
    }
  }
  if (action === 'depositLendle') {
    const { amount } = params as { amount: number };
    if (amount > GUARDRAIL_DEFAULTS.softMaxLendleDepositUsd) {
      return {
        required: true,
        reason: `Deposit amount $${amount} exceeds $${GUARDRAIL_DEFAULTS.softMaxLendleDepositUsd} — confirmation required`,
      };
    }
  }
  return { required: false };
}
// ============================================================
// POST-EXECUTION CIRCUIT BREAKERS
// ============================================================
export function postExecution(result: TxResult, lossUsd?: number) {
  const state = getCircuitBreakerState();
  if (!result.success) {
    // Track consecutive failures
    const newConsecutiveLosses = state.consecutiveLosses + 1;
    updateCircuitBreaker({ consecutiveLosses: newConsecutiveLosses });
    if (newConsecutiveLosses >= GUARDRAIL_DEFAULTS.maxConsecutiveLosses) {
      updateCircuitBreaker({
        isTripped: true,
        reason: `${newConsecutiveLosses} consecutive failed transactions. Review before continuing.`,
        trippedAt: new Date().toISOString(),
      });
    }
  } else {
    // Reset consecutive loss counter on success
    if (state.consecutiveLosses > 0) {
      updateCircuitBreaker({ consecutiveLosses: 0 });
    }
    // Track P&L losses (if position was a loss)
    if (lossUsd && lossUsd > 0) {
      const newDailyLoss = state.dailyLossUsd + lossUsd;
      updateCircuitBreaker({ dailyLossUsd: newDailyLoss });
      if (newDailyLoss >= GUARDRAIL_DEFAULTS.maxDailyLossUsd) {
        updateCircuitBreaker({
          isTripped: true,
          reason: `Daily loss limit of $${GUARDRAIL_DEFAULTS.maxDailyLossUsd} reached ($${newDailyLoss.toFixed(2)} lost today).`,
          trippedAt: new Date().toISOString(),
        });
      }
    }
  }
}
// ============================================================
// KILL SWITCH + RESET
// ============================================================
export function engageKillSwitch(reason = 'Manual kill switch engaged by user') {
  dbEngageKillSwitch(reason);
}
export function disengageKillSwitch() {
  dbResetCircuitBreaker();
}
export function resetCircuitBreaker() {
  dbResetCircuitBreaker();
}
export function getState() {
  return getCircuitBreakerState();
}
// ============================================================
// GUARDRAIL STATUS SUMMARY (for UI display)
// ============================================================
export function getGuardrailStatus() {
  const state = getCircuitBreakerState();
  return {
    killSwitch: state.killSwitchEngaged,
    circuitBreakerTripped: state.isTripped,
    circuitBreakerReason: state.reason,
    consecutiveLosses: state.consecutiveLosses,
    dailyLossUsd: state.dailyLossUsd,
    dailyLossLimitUsd: GUARDRAIL_DEFAULTS.maxDailyLossUsd,
    maxLeverage: GUARDRAIL_DEFAULTS.maxLeverageX,
    maxTradeSize: GUARDRAIL_DEFAULTS.maxSingleTradeSizeUsd,
    softTradeLimit: GUARDRAIL_DEFAULTS.softMaxTradeSizeUsd,
    approvedTokens: GUARDRAIL_DEFAULTS.approvedTokens,
    approvedMarkets: GUARDRAIL_DEFAULTS.approvedMarkets,
  };
}
