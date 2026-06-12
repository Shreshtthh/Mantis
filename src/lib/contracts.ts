/**
 * Contract ABIs and instances
 *
 * Contains:
 * - ERC-20 ABI (minimal — approve, transfer, balanceOf, decimals)
 * - ERC-8004 registry ABIs (Identity, Reputation, Validation)
 * - Merchant Moe Router ABI (Uniswap V2 compatible)
 * - Lendle Pool ABI (Aave V2 compatible)
 * - Mock contract ABIs (for testnet)
 */

import { config } from '@/agent/config';

// ============================================================
// ERC-20 (minimal)
// ============================================================

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ============================================================
// ERC-8004 IDENTITY REGISTRY
// ============================================================

export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getIdentity',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'metadataUri', type: 'string' },
      { name: 'registeredAt', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getAgentByAddress',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mintIdentity',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'metadataUri', type: 'string' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
] as const;

// ============================================================
// ERC-8004 REPUTATION REGISTRY
// ============================================================

export const REPUTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getReputation',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'score', type: 'uint256' },
      { name: 'totalRatings', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'rateAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'uint256' }, // 1-100
      { name: 'comment', type: 'string' },
    ],
    outputs: [],
  },
] as const;

// ============================================================
// ERC-8004 VALIDATION REGISTRY (self-audit)
// ============================================================

export const VALIDATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitValidation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'txHash', type: 'bytes32' },
      { name: 'ipfsCid', type: 'string' },
      { name: 'rationaleHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'validationId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getValidation',
    stateMutability: 'view',
    inputs: [{ name: 'validationId', type: 'uint256' }],
    outputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'txHash', type: 'bytes32' },
      { name: 'ipfsCid', type: 'string' },
      { name: 'rationaleHash', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getAgentValidations',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ name: 'validationIds', type: 'uint256[]' }],
  },
] as const;

// ============================================================
// MERCHANT MOE ROUTER (Uniswap V2 compatible)
// ============================================================

export const MOE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

// ============================================================
// LENDLE LENDING POOL (Aave V2 compatible)
// ============================================================

export const LENDLE_POOL_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getReserveData',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configuration', type: 'uint256' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'currentLiquidityRate', type: 'uint128' },
          { name: 'currentVariableBorrowRate', type: 'uint128' },
          { name: 'currentStableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'id', type: 'uint8' },
        ],
      },
    ],
  },
] as const;

// ============================================================
// MOCK CONTRACTS (testnet only — same ABI as real ones but simpler)
// ============================================================

// MockERC20 — adds mint() for test token distribution
export const MOCK_ERC20_ABI = [
  ...ERC20_ABI,
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// MockRouter — same ABI as MOE_ROUTER_ABI
export const MOCK_ROUTER_ABI = MOE_ROUTER_ABI;

// MockLendingPool — same ABI as LENDLE_POOL_ABI
export const MOCK_LENDING_POOL_ABI = LENDLE_POOL_ABI;

// ============================================================
// CONTRACT ADDRESS MAP (from config)
// ============================================================

export const CONTRACTS = {
  merchantMoeRouter: config.contracts.merchantMoeRouter,
  lendlePool: config.contracts.lendlePool,
  erc8004Identity: config.contracts.erc8004Identity,
  erc8004Reputation: config.contracts.erc8004Reputation,
  erc8004Validation: config.contracts.erc8004Validation,
} as const;

export const TOKENS = config.tokens;
