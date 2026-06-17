/**
 * Mantis Agent Configuration
 *
 * Single source of truth for:
 * - Network selection (testnet / mainnet)
 * - RPC endpoints, chain IDs, explorer URLs
 * - Token addresses
 * - Contract addresses (real protocols + testnet mocks)
 * - Guardrail defaults
 *
 * Flip NETWORK=mainnet in .env to switch the entire app to mainnet.
 * Zero code changes required.
 */
export type NetworkName = 'testnet' | 'mainnet';
const NETWORK = (process.env.NETWORK || 'testnet') as NetworkName;
// ============================================================
// TOKEN ADDRESSES
// ============================================================
const MAINNET_TOKENS = {
  WMNT: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb' as `0x${string}`,
  USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF' as `0x${string}`,
  USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE' as `0x${string}`,
  WETH: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111' as `0x${string}`,
  mETH: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0' as `0x${string}`,
} as const;
// Testnet tokens are MockERC20 contracts deployed by us on Mantle Sepolia.
// Addresses are populated after mock contract deployment (Phase 1 Day 1).
const TESTNET_TOKENS = {
  WMNT: '0x132AD79122Aef72d0F82FED8666D7CDA7c9C9f54' as `0x${string}`,
  USDC: '0x5d2040b04C8fFc4079Cf79eba59A0b23a29F1997' as `0x${string}`,
  USDT: '0x960D6e42b2A20cE748c09F66f17F735C55aF7Ac7' as `0x${string}`,
  WETH: '0xF2Cb0cfa25653726a150A0Ea2A1d7Cde11B3fF8E' as `0x${string}`,
  mETH: '0xc519dd58a8f982B115F2922D60B09EbfdFd62A89' as `0x${string}`,
} as const;
// ============================================================
// PROTOCOL CONTRACT ADDRESSES
// ============================================================
const MAINNET_CONTRACTS = {
  agentVault: '0x0000000000000000000000000000000000000000' as `0x${string}`,  // TODO: deploy to mainnet
  // Merchant Moe DEX
  merchantMoeRouter: '0xeaEE7EE68874218c3558b40063c42B82D3E7232a' as `0x${string}`,
  // Lendle (Aave fork)
  lendlePool: '0xcFa9B6Fb9c5eE6F29A27f3A1C25BBa4EeF50AF14' as `0x${string}`,
  lendleDataProvider: '0x7c6Ea19e2e44C54D8E3CC9b5B4AE5A99e0C67e1b' as `0x${string}`,
  // ERC-8004 Registries (on Mantle mainnet — same addresses used on both testnet and mainnet if deployed there)
  erc8004Identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  erc8004Reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as `0x${string}`,
  erc8004Validation: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272' as `0x${string}`,
} as const;
const TESTNET_CONTRACTS = {
  // Deployed contracts on Mantle Sepolia
  agentVault: '0x543Ad9C3Bc414691E07F468850e5aD45A2A9Ad6f' as `0x${string}`,
  merchantMoeRouter: '0x2C2FBDDf5Af560356e7b36D84DF10CFfb813525F' as `0x${string}`,
  lendlePool:        '0xcA6d520efDf9D86B446CAb3bB107E5cBA4091d92' as `0x${string}`,
  lendleDataProvider: '0x0000000000000000000000000000000000000000' as `0x${string}`,// MockDataProvider (TODO: deploy mock)
  // ERC-8004 Registries (same addresses — they may be on mainnet only; reads will fallback gracefully)
  erc8004Identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  erc8004Reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as `0x${string}`,
  erc8004Validation: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272' as `0x${string}`,
} as const;
// ============================================================
// NETWORK CONFIG
// ============================================================
const MAINNET_CONFIG = {
  rpc: 'https://rpc.mantle.xyz',
  chainId: 5000,
  explorer: 'https://explorer.mantle.xyz',
  explorerApi: 'https://api.mantlescan.xyz/api',
  name: 'Mantle',
  tokens: MAINNET_TOKENS,
  contracts: MAINNET_CONTRACTS,
};
const TESTNET_CONFIG = {
  rpc: 'https://rpc.sepolia.mantle.xyz',
  chainId: 5003,
  explorer: 'https://explorer.sepolia.mantle.xyz',
  explorerApi: 'https://api-sepolia.mantlescan.xyz/api',
  name: 'Mantle Sepolia',
  tokens: TESTNET_TOKENS,
  contracts: TESTNET_CONTRACTS,
};
// ============================================================
// GUARDRAIL DEFAULTS
// ============================================================
export const GUARDRAIL_DEFAULTS = {
  // Hard limits — cannot be overridden
  maxLeverageX: 2,                    // Conservative: only 2x at demo scale
  maxSingleTradeSizeUsd: 20,          // ETH min position ~$8 margin at 2x, cap at $20
  maxDailyLossUsd: 5,                 // Circuit breaker: pause after $5 loss in 24h
  maxPortfolioConcentrationPct: 100,  // Only trading ETH — concentration limit irrelevant
  maxConsecutiveLosses: 3,            // Circuit breaker: pause after 3 losses in a row
  approvedTokens: ['USDC', 'MNT', 'WMNT', 'mETH', 'WETH', 'USDT'] as string[],
  approvedMarkets: ['ETH-PERP'] as string[],  // Only ETH at demo scale (BTC $84 min, SOL $125 min)
  // Soft limits — require user approval when exceeded
  softMaxTradeSizeUsd: 25,            // Soft limit above hard cap ($20) — no broken approval loop
  softMaxLendleDepositUsd: 50,
  // Circuit breaker thresholds
  maxGasGwei: 100,                    // Demo-only: higher tolerance
  minSlippagePct: 0.1,
  maxSlippagePct: 5,
};
// ============================================================
// ERC-8004 AGENT IDENTITY
// ============================================================
export const AGENT_IDENTITY = {
  name: 'Mantis',
  version: '1.0.0',
  description: 'Autonomous DeFi agent on Mantle. Manages swaps, lending, and perps through natural language.',
  // Populated after identity NFT is minted (Phase 4)
  tokenId: process.env.AGENT_TOKEN_ID ? BigInt(process.env.AGENT_TOKEN_ID) : null,
};
// ============================================================
// BYREAL PERPS CONFIG
// ============================================================
export const BYREAL_CONFIG = {
  // Markets Mantis is authorized to trade
  allowedMarkets: ['BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'GOLD-PERP', 'SILVER-PERP', 'OIL-PERP'],
  maxLeverage: 5, // Mantis hard-caps at 5x regardless of Byreal's 40x max
};
// ============================================================
// CONSOLIDATED PERPS CONFIG (v2 — used by managePerps tool)
// ============================================================
export const PERPS_CONFIG = {
  maxLeverage: 2,  // Conservative at demo scale — 2x only
  approvedCoins: ['ETH'] as string[],  // Only ETH tradeable with $10 demo capital
  maxPositionSizeUsd: 20,  // 0.01 ETH minimum ~$8 margin at 2x, cap at $20
};
// ============================================================
// ALPHA & DATA CONFIG (v2 — used by smart-money/dex-analytics)
// ============================================================
export const ALPHA_CONFIG = {
  smartMoneyMinTransferUsd: 10_000,
  mantlescanApiKey: process.env.MANTLESCAN_API_KEY ?? '',
};
// ============================================================
// EXPORT
// ============================================================
export const config = NETWORK === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
export { NETWORK };
export type TokenSymbol = keyof typeof MAINNET_TOKENS;
export type ContractKey = keyof typeof MAINNET_CONTRACTS;
