/**
 * Chat API Route — Mantis Agent v2
 *
 * Consolidated 14-tool registry (down from 31).
 * Flow per request:
 *   1. Receive user message
 *   2. LLM chooses a tool (streamText with tool calling)
 *   3. Pre-execution: hard guardrail check
 *   4. Pre-execution: soft guardrail check (needs approval?)
 *   5. Execute tool
 *   6. Async self-audit (non-blocking)
 */

import { streamText, stepCountIs, tool } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '@/agent/system-prompt';
import * as guardrails from '@/agent/guardrails';
import { audit } from '@/agent/auditor';

// Tool imports — read
import { compareYields, getPortfolio, generateStrategyProposal } from '@/agent/tools/analytics';
import { getWalletBalance } from '@/agent/wallet';
import { getAgentProfile, getAgentValidations, getValidation } from '@/agent/tools/erc8004';
import { getTransactionHistory, getGasPrice } from '@/agent/tools/mantle-read';
import { getAgentAddress } from '@/lib/mantle';
import { AGENT_IDENTITY, config } from '@/agent/config';

// Tool imports — perps
import {
  marketOrder,
  limitOrder,
  setTpSl,
  setLeverage,
  closeMarket,
  cancelOrder,
  cancelAll,
  listOrders,
  listPositions,
  getAccountInfo,
  getHistory,
  scanSignals,
  signalDetail,
} from '@/agent/tools/byreal-perps';

// Tool imports — DeFi
import { swapTokens, getSwapQuote, encodeSwapData } from '@/agent/tools/merchant-moe';
import { deposit as lendleDeposit, withdraw as lendleWithdraw, getLendingRates, encodeLendleDepositData, encodeLendleWithdrawData } from '@/agent/tools/lendle';

// Tool imports — vault
import { vaultExecute, getVaultState, encodeRequestWithdrawal, encodeExecuteWithdrawal, encodeCancelWithdrawal } from '@/agent/vault';

// Tool imports — sentiment
import { analyzeSentiment, scanSentiment } from '@/agent/tools/sentiment';

// Tool imports — alpha
import { getWhaleTransfers } from '@/agent/tools/smart-money';
import { getMerchantMoePools, getPriceImpact, getLiquidityDepth } from '@/agent/tools/dex-analytics';

// Tool imports — wallet
import { logDeposit } from '@/lib/db';

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });

export const runtime = 'nodejs'; // Required for better-sqlite3

// DeepSeek handles empty params natively — no workaround needed.
const EMPTY_PARAMS = z.object({});

/**
 * Strip BigInt values (recursively) from any object.
 * viem returns BigInt for balances, gas, etc. — but DeepSeek's
 * message converter calls JSON.stringify which fails on BigInt.
 */
function stripBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

/** Wrap a tool execute fn to auto-strip BigInts from the return value */
function safe<E extends (...args: any[]) => any>(fn: E): E {
  return (async (...args: any[]) => stripBigInts(await fn(...args))) as E;
}

/**
 * Normalize incoming messages from UIMessage format (parts[]) to
 * CoreMessage format (content). The @ai-sdk/react v3 useChat hook sends
 * client-side UIMessage objects; streamText expects CoreMessage.
 *
 * Key differences between UIMessage and CoreMessage:
 *   - UIMessage has `parts[]`, CoreMessage has `content` (string or array)
 *   - tool-call: UIMessage uses `args`, CoreMessage uses `input`
 *   - tool-result: UIMessage output is raw; CoreMessage wraps in
 *     discriminated union { type: "json", value: ... } or { type: "text", value: ... }
 *   - role:"tool" only allows tool-result + tool-approval-response in CoreMessage
 */

/** Wrap raw tool output into the discriminated-union format CoreMessage expects */
function wrapToolOutput(output: any): any {
  if (!output || typeof output !== 'object') {
    return { type: 'text', value: String(output ?? '') };
  }
  // Already in the correct discriminated-union format? Return as-is.
  if ('type' in output && ['text', 'json', 'execution-denied', 'error-text', 'error-json', 'content'].includes(output.type)) {
    return output;
  }
  // Raw value — wrap as json, stripping any BigInts first
  return { type: 'json', value: stripBigInts(output) };
}

/** Convert a single UIMessage part to a CoreMessage content part */
function normalizeContentPart(part: any): any {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'reasoning':
      return { type: 'reasoning', text: part.text };
    case 'file':
      return { type: 'file', data: part.data, mediaType: part.mediaType };
    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input ?? part.args,        // UIMessage uses args, CoreMessage uses input
      };
    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: wrapToolOutput(part.output),
      };
    case 'tool-approval-request':
      return {
        type: 'tool-approval-request',
        approvalId: part.approvalId,
        toolCallId: part.toolCallId,
      };
    case 'tool-approval-response':
      return {
        type: 'tool-approval-response',
        approvalId: part.approvalId,
        approved: part.approved,
        reason: part.reason,
      };
    default:
      // Unknown part type — drop it rather than failing validation
      return null;
  }
}

function normalizeMessages(raw: any[]): any[] {
  return raw.map((msg: any) => {
    // Determine the source parts array — either explicit parts[] or content array
    const sourceParts: any[] | null = msg.parts ?? (Array.isArray(msg.content) ? msg.content : null);

    // If no array to convert, return as-is (string content, or already valid CoreMessage)
    if (!sourceParts) return msg;

    // Convert every part
    const converted = sourceParts
      .map((p: any) => normalizeContentPart(p))
      .filter(Boolean); // drop nulls (unknown types)

    // --- role-specific filtering / coercion ---

    if (msg.role === 'tool') {
      // CoreMessage tool role ONLY allows tool-result + tool-approval-response
      const filtered = converted.filter(
        (p: any) => p.type === 'tool-result' || p.type === 'tool-approval-response'
      );
      return { role: 'tool', content: filtered.length > 0 ? filtered : [{ type: 'tool-result', toolCallId: 'unknown', toolName: 'unknown', output: { type: 'json', value: {} } }] };
    }

    // For user / assistant / system: prefer string if all parts are text
    if (converted.every((p: any) => p.type === 'text')) {
      const joined = converted.map((p: any) => p.text).join('');
      return { role: msg.role, content: joined || ' ' };
    }

    return { role: msg.role, content: converted };
  });
}

/**
 * Max requests per session/IP to prevent abuse.
 */
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;       // requests
const RATE_LIMIT_WINDOW = 60_000; // per minute

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(sessionId);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(sessionId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const { messages: rawMessages, sessionId = 'default' } = await req.json();

    // Rate limit check
    if (!checkRateLimit(sessionId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = normalizeMessages(rawMessages);

    const result = await streamText({
      model: deepseek('deepseek-chat'),
      system: SYSTEM_PROMPT,
      messages,
      stopWhen: stepCountIs(5),
      toolChoice: 'auto',

      tools: {
        // ========================================================
        // READ TOOLS (1–7) — no guardrails needed
        // ========================================================

        // 1. getPortfolio — combined wallet, positions, P&L
        getPortfolio: tool({
          description: "Get Mantis's full portfolio: wallet balances across all tokens, Lendle lending positions, Byreal Perps positions, and P&L summary",
          inputSchema: EMPTY_PARAMS,
          execute: safe(async () => {
            return await getPortfolio();
          }),
        }),

        // 2. getYields — cross-protocol yield comparison
        getYields: tool({
          description: 'Compare yields for a token across Mantle DeFi protocols (Lendle, Merchant Moe LP, mETH staking). Returns table of APYs.',
          inputSchema: z.object({
            token: z.enum(['USDC', 'mETH', 'MNT', 'WETH', 'USDT']).describe('Token to compare yields for'),
          }),
          execute: safe(async ({ token }) => {
            return await compareYields(token);
          }),
        }),

        // 3. getMarketIntel — consolidated alpha tool
        getMarketIntel: tool({
          description: 'Get market intelligence: scan all market signals, get detailed technical analysis for a coin, track whale transfers on Mantle, or analyze DEX pools',
          inputSchema: z.object({
            action: z.enum(['scan_signals', 'signal_detail', 'track_whales', 'dex_analysis']).describe('Type of intelligence to fetch'),
            coin: z.string().optional().describe('Coin for signal_detail (e.g. BTC, ETH, SOL)'),
            token: z.string().optional().describe('Token for track_whales'),
            minUsdAmount: z.number().optional().describe('Min USD amount for whale filter'),
          }),
          execute: safe(async (params) => {
            switch (params.action) {
              case 'scan_signals':
                return await scanSignals();
              case 'signal_detail':
                if (!params.coin) return { error: 'coin is required for signal_detail' };
                return await signalDetail(params.coin);
              case 'track_whales':
                return await getWhaleTransfers(
                  params.token ?? '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF',
                  params.minUsdAmount ?? 10_000
                );
              case 'dex_analysis':
                return await getMerchantMoePools();
              default:
                return { error: 'Unknown action' };
            }
          }),
        }),

        // 4. getAuditTrail
        getAuditTrail: tool({
          description: "Get Mantis's recent on-chain audit trail from the ERC-8004 Validation Registry — IPFS CIDs and validation hashes",
          inputSchema: z.object({
            limit: z.number().min(1).max(20).default(5),
          }),
          execute: safe(async ({ limit }) => {
            const agentId = AGENT_IDENTITY.tokenId;
            if (!agentId) {
              return { entries: [], message: 'Agent identity not yet minted. Deploy identity NFT first.' };
            }
            const validationIds = await getAgentValidations(agentId, 0, limit);
            const entries = await Promise.all(validationIds.map((id) => getValidation(id)));
            return { entries: entries.filter(Boolean) };
          }),
        }),

        // 5. getAgentIdentity
        getAgentIdentity: tool({
          description: "Get Mantis's ERC-8004 on-chain identity NFT metadata, reputation score, and agent profile",
          inputSchema: EMPTY_PARAMS,
          execute: safe(async () => {
            return await getAgentProfile();
          }),
        }),

        // 6. getPerpsAccount — Byreal account read
        getPerpsAccount: tool({
          description: 'Get Byreal Perps account info, open positions, open orders, or trade history',
          inputSchema: z.object({
            query: z.enum(['info', 'positions', 'orders', 'history']).describe('What to query'),
          }),
          execute: safe(async ({ query }) => {
            switch (query) {
              case 'info':
                return await getAccountInfo();
              case 'positions':
                return await listPositions();
              case 'orders':
                return await listOrders();
              case 'history':
                return await getHistory();
              default:
                return { error: 'Unknown query' };
            }
          }),
        }),

        // 7. getSentiment — aggregated market sentiment with news
        getSentiment: tool({
          description: 'Get aggregated market sentiment for a coin or all tracked coins. Combines Fear & Greed Index, CoinGecko price action, CryptoPanic news headlines, and Hyperliquid funding rates into a single directional signal with confidence score. Use this to understand market mood before trading.',
          inputSchema: z.object({
            coin: z.enum(['BTC', 'ETH', 'SOL']).optional().describe('Coin to analyze. Omit to scan ALL tracked coins.'),
          }),
          execute: safe(async ({ coin }) => {
            if (coin) return await analyzeSentiment(coin);
            return await scanSentiment();
          }),
        }),

        // 8. getStrategyProposal
        getStrategyProposal: tool({
          description: 'Generate an AI strategy recommendation based on current market signals, whale activity, yields, and portfolio. Returns structured proposal with reasoning.',
          inputSchema: EMPTY_PARAMS,
          execute: safe(async () => {
            return await generateStrategyProposal();
          }),
        }),

        // ========================================================
        // WRITE TOOLS (8–14) — all guardrailed
        // ========================================================

        // 8. swapTokens
        swapTokens: tool({
          description: 'Swap tokens on Merchant Moe DEX via the AgentVault on Mantle. All trades are executed through the vault with on-chain guardrails.',
          inputSchema: z.object({
            tokenIn: z.enum(['USDC', 'mETH', 'MNT', 'WETH', 'USDT']).describe('Token to sell'),
            tokenOut: z.enum(['USDC', 'mETH', 'MNT', 'WETH', 'USDT']).describe('Token to buy'),
            amount: z.number().positive().describe('Amount of tokenIn to swap'),
            slippagePercent: z.number().min(0.1).max(5).default(1).describe('Max slippage tolerance %'),
          }),
          execute: safe(async (params) => {
            const hardCheck = guardrails.checkHard('swapTokens', params as Record<string, unknown>);
            if (!hardCheck.allowed) return { blocked: true, reason: hardCheck.reason };

            const softCheck = guardrails.needsApproval('swapTokens', params as Record<string, unknown>);
            if (softCheck.required) {
              return { needsApproval: true, reason: softCheck.reason, preview: params };
            }

            // Vault-based execution:
            // Step 1: Encode the swap calldata (recipient = vault itself)
            const swapData = await encodeSwapData({
              tokenIn: params.tokenIn,
              tokenOut: params.tokenOut,
              amount: params.amount,
              slippagePercent: params.slippagePercent,
              recipient: config.contracts.agentVault, // vault receives output tokens
            });

            // Step 2: Estimate USD value for on-chain guardrails
            const { getTokenPrices } = await import('@/agent/wallet');
            const prices = await getTokenPrices([params.tokenIn]);
            const valueUsd = params.amount * (prices[params.tokenIn] ?? 1);

            // Step 3: Execute through the vault
            const result = await vaultExecute({
              target: config.contracts.merchantMoeRouter,
              value: 0n,
              data: swapData,
              valueUsd: Math.round(valueUsd * 100) / 100,
              rationaleCid: 'ipfs://pending',
            });

            guardrails.postExecution(result);
            audit({ action: 'swapTokens', actionParams: params, result, messages }).catch(() => {});
            return result;
          }),
        }),

        // 9. manageLending — consolidated deposit + withdraw via AgentVault
        manageLending: tool({
          description: 'Deposit or withdraw tokens from Lendle lending protocol via the AgentVault. All funds flow through the vault.',
          inputSchema: z.object({
            action: z.enum(['deposit', 'withdraw']).describe('Whether to deposit or withdraw'),
            token: z.enum(['USDC', 'mETH', 'MNT', 'WETH', 'USDT']).describe('Token to deposit/withdraw'),
            amount: z.number().positive().describe('Amount to deposit/withdraw'),
          }),
          execute: safe(async (params) => {
            const guardrailAction = params.action === 'deposit' ? 'manageLending' : 'manageLending';
            const hardCheck = guardrails.checkHard(guardrailAction, params as Record<string, unknown>);
            if (!hardCheck.allowed) return { blocked: true, reason: hardCheck.reason };

            if (params.action === 'deposit') {
              const softCheck = guardrails.needsApproval('depositLendle', params as Record<string, unknown>);
              if (softCheck.required) {
                return { needsApproval: true, reason: softCheck.reason, preview: params };
              }
            }

            // Encode the lending action for vault execution
            const vaultAddress = config.contracts.agentVault;
            const lendData = params.action === 'deposit'
              ? encodeLendleDepositData({
                  token: params.token,
                  amount: params.amount,
                  onBehalfOf: vaultAddress,
                })
              : encodeLendleWithdrawData({
                  token: params.token,
                  amount: params.amount,
                  to: vaultAddress,
                });

            // Estimate USD value
            const { getTokenPrices } = await import('@/agent/wallet');
            const prices = await getTokenPrices([params.token]);
            const valueUsd = params.amount * (prices[params.token] ?? 1);

            // Execute through vault
            const result = await vaultExecute({
              target: config.contracts.lendlePool,
              value: 0n,
              data: lendData,
              valueUsd: Math.round(valueUsd * 100) / 100,
              rationaleCid: 'ipfs://pending',
            });

            guardrails.postExecution(result);
            audit({ action: `${params.action}Lendle`, actionParams: params, result, messages }).catch(() => {});
            return result;
          }),
        }),

        // 10. managePerps — ALL Byreal Perps write operations
        managePerps: tool({
          description: 'Execute Byreal Perps operations: market/limit orders, set TP/SL, close positions, cancel orders, set leverage. Max 5x leverage enforced.',
          inputSchema: z.object({
            action: z.enum([
              'market_buy', 'market_sell',
              'limit_buy', 'limit_sell',
              'set_tpsl', 'close_market',
              'cancel_order', 'cancel_all',
              'set_leverage',
            ]).describe('The perps operation to execute'),
            coin: z.enum(['BTC', 'ETH', 'SOL']).optional().describe('Coin (required for most actions)'),
            size: z.number().positive().optional().describe('Position size in USD'),
            price: z.number().positive().optional().describe('Limit price (for limit orders)'),
            tp: z.number().positive().optional().describe('Take profit price'),
            sl: z.number().positive().optional().describe('Stop loss price'),
            leverage: z.number().min(1).max(5).optional().describe('Leverage (max 5x)'),
            orderId: z.string().optional().describe('Order ID (for cancel_order)'),
          }),
          execute: safe(async (params) => {
            // Hard guardrail
            const hardCheck = guardrails.checkHard('managePerps', params as Record<string, unknown>);
            if (!hardCheck.allowed) return { blocked: true, reason: hardCheck.reason };

            // All perps trades need approval
            const tradeActions = ['market_buy', 'market_sell', 'limit_buy', 'limit_sell'];
            if (tradeActions.includes(params.action)) {
              return {
                needsApproval: true,
                reason: `Perps ${params.action} requires confirmation: ${params.coin} $${params.size} ${params.leverage ? `at ${params.leverage}x` : ''}`,
                preview: params,
                note: 'User must confirm. After approval, call confirmPerpsAction.',
              };
            }

            // Non-trade actions execute directly
            let result;
            switch (params.action) {
              case 'set_tpsl':
                result = await setTpSl({ coin: params.coin!, tp: params.tp, sl: params.sl });
                break;
              case 'close_market':
                result = await closeMarket(params.coin!);
                break;
              case 'cancel_order':
                result = await cancelOrder(params.orderId!);
                break;
              case 'cancel_all':
                result = await cancelAll();
                break;
              case 'set_leverage':
                result = await setLeverage({ coin: params.coin!, leverage: params.leverage! });
                break;
              default:
                return { error: 'Unknown action' };
            }

            guardrails.postExecution(result);
            audit({ action: `perps_${params.action}`, actionParams: params, result, messages }).catch(() => {});
            return result;
          }),
        }),

        // Confirmation tool for perps (called after user approves)
        confirmPerpsAction: tool({
          description: 'Execute a previously confirmed perps trade (called after user approval)',
          inputSchema: z.object({
            action: z.enum(['market_buy', 'market_sell', 'limit_buy', 'limit_sell']),
            coin: z.enum(['BTC', 'ETH', 'SOL']),
            size: z.number().positive().max(500),
            price: z.number().positive().optional(),
            tp: z.number().positive().optional(),
            sl: z.number().positive().optional(),
            leverage: z.number().min(1).max(5).optional(),
          }),
          execute: safe(async (params) => {
            const hardCheck = guardrails.checkHard('managePerps', params as Record<string, unknown>);
            if (!hardCheck.allowed) return { blocked: true, reason: hardCheck.reason };

            let result;
            if (params.action === 'market_buy' || params.action === 'market_sell') {
              result = await marketOrder({
                side: params.action === 'market_buy' ? 'buy' : 'sell',
                size: params.size,
                coin: params.coin,
                tp: params.tp,
                sl: params.sl,
              });
            } else {
              result = await limitOrder({
                side: params.action === 'limit_buy' ? 'buy' : 'sell',
                size: params.size,
                coin: params.coin,
                price: params.price!,
                tp: params.tp,
                sl: params.sl,
              });
            }

            guardrails.postExecution(result);
            audit({ action: `perps_${params.action}`, actionParams: params, result, messages }).catch(() => {});
            return result;
          }),
        }),

        // 11. withdrawFunds — vault-based withdrawal with timelock
        withdrawFunds: tool({
          description: 'Initiate withdrawal from the AgentVault. Funds are subject to a 1-hour timelock for security. After the timelock, the owner (you) executes the withdrawal from MetaMask.',
          inputSchema: z.object({
            token: z.enum(['MNT', 'USDC', 'WETH', 'mETH', 'USDT']).describe('Token to withdraw'),
            amount: z.number().positive().describe('Amount to withdraw'),
            toAddress: z.string().describe('Your wallet address (0x...)'),
          }),
          execute: safe(async (params) => {
            const hardCheck = guardrails.checkHard('withdrawFunds', params as Record<string, unknown>);
            if (!hardCheck.allowed) return { blocked: true, reason: hardCheck.reason };

            // Vault withdrawal is a two-step owner process:
            // 1. requestWithdrawal(token) — starts the timelock
            // 2. executeWithdrawal() — after timelock, sends tokens to owner

            // Encode the requestWithdrawal call (user signs this in MetaMask)
            const tokenAddress = config.tokens[params.token as keyof typeof config.tokens] ?? '0x0';
            const requestData = encodeRequestWithdrawal(tokenAddress);
            const cancelData = encodeCancelWithdrawal();
            const executeData = encodeExecuteWithdrawal();

            const vaultStateResult = await getVaultState().catch(() => null);

            return {
              needsApproval: true,
              reason: `Withdrawal: ${params.amount} ${params.token} from AgentVault to ${params.toAddress.slice(0, 8)}...\n\nSubject to ${vaultStateResult?.withdrawalDelay ? Number(vaultStateResult.withdrawalDelay) / 3600 : 1}-hour timelock.`,
              preview: params,
              instruction: 'Open your dashboard → Withdraw tab to sign the requestWithdrawal transaction with MetaMask.',
              vaultState: vaultStateResult ? {
                address: vaultStateResult.address,
                owner: vaultStateResult.owner,
                withdrawalDelay: Number(vaultStateResult.withdrawalDelay),
                pendingWithdrawal: vaultStateResult.pendingWithdrawal ? {
                  token: vaultStateResult.pendingWithdrawal.token,
                  amount: Number(vaultStateResult.pendingWithdrawal.amount),
                  unlockAt: Number(vaultStateResult.pendingWithdrawal.unlockAt),
                } : null,
              } : null,
              withdrawSteps: {
                step1: `Sign: requestWithdrawal(${params.token})`,
                encodedStep1Data: requestData,
                step2: `Wait ~${vaultStateResult?.withdrawalDelay ? Number(vaultStateResult.withdrawalDelay) / 60 : 60} minutes`,
                step3: 'Sign: executeWithdrawal()',
                encodedStep3Data: executeData,
                cancelOption: { description: 'Cancel pending withdrawal', encodedData: cancelData },
              },
            };
          }),
        }),

        // 12. selfAudit
        selfAudit: tool({
          description: 'Manually trigger a self-audit: hash rationale, pin to IPFS, submit to ERC-8004 Validation Registry',
          inputSchema: z.object({
            action: z.string().describe('Action being audited'),
            reasoning: z.string().describe('Why this action was taken'),
          }),
          execute: safe(async (params) => {
            const result = await audit({
              action: params.action,
              actionParams: { reasoning: params.reasoning },
              result: { success: true },
              messages,
            });
            return result ?? { error: 'Audit failed' };
          }),
        }),

        // 13. setGuardrails — adjust parameters (with safety limits)
        setGuardrails: tool({
          description: 'Adjust guardrail parameters. Can only tighten limits, not loosen beyond defaults.',
          inputSchema: z.object({
            maxTradeSize: z.number().min(10).max(500).optional().describe('Max single trade size in USD'),
            maxDailyLoss: z.number().min(10).max(200).optional().describe('Max daily loss in USD'),
          }),
          execute: safe(async (params) => {
            // For hackathon, we just report the current state.
            // Real implementation would persist adjusted guardrails.
            return {
              message: 'Guardrail adjustment noted. Current guardrails remain enforced at code level.',
              current: guardrails.getGuardrailStatus(),
              requested: params,
            };
          }),
        }),

        // 14. killSwitch
        killSwitch: tool({
          description: 'Emergency: engage or disengage the kill switch. When engaged, ALL trading actions are blocked immediately.',
          inputSchema: z.object({
            action: z.enum(['engage', 'disengage']).describe('Whether to engage or disengage'),
            reason: z.string().optional().describe('Reason for engaging'),
          }),
          execute: safe(async ({ action, reason }) => {
            if (action === 'engage') {
              guardrails.engageKillSwitch(reason ?? 'Manual kill switch by user');
              return { success: true, message: `🛑 Kill switch engaged: ${reason ?? 'Manual'}` };
            } else {
              guardrails.disengageKillSwitch();
              return { success: true, message: '✅ Kill switch disengaged. Operations resumed.' };
            }
          }),
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error('CHAT API ERROR:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred in chat route' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
