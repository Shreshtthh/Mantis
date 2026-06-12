/**
 * viem clients for Mantle (testnet and mainnet)
 *
 * Exports:
 * - mantlePublic  — read-only public client (no wallet)
 * - mantleWallet  — wallet client (signs txs with MANTLE_PRIVATE_KEY)
 * - mantleAccount — the EOA account object
 */

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '@/agent/config';

// ============================================================
// CHAIN DEFINITION
// ============================================================
// viem has built-in `mantle` chain but we define it dynamically
// so we can switch RPC/chainId based on NETWORK env var.

export const mantleChain = defineChain({
  id: config.chainId,
  name: config.name,
  nativeCurrency: {
    decimals: 18,
    name: 'MNT',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: [config.rpc],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantlescan',
      url: config.explorer,
    },
  },
});

// ============================================================
// PUBLIC CLIENT (read-only)
// ============================================================

export const mantlePublic = createPublicClient({
  chain: mantleChain,
  transport: http(config.rpc),
});

// ============================================================
// WALLET CLIENT (signing)
// ============================================================
// Only created on the server (has access to MANTLE_PRIVATE_KEY)
// This file should NEVER be imported from client components.

function createMantleWallet() {
  const privateKey = process.env.MANTLE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('MANTLE_PRIVATE_KEY env var not set');
  }
  // viem requires 0x prefix — add it if missing
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(normalizedKey as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: mantleChain,
    transport: http(config.rpc),
  });
  return { wallet, account };
}

// Lazy-initialize to avoid errors when imported in contexts without the env var
let _walletInstance: ReturnType<typeof createMantleWallet> | null = null;

export function getMantleWallet() {
  if (!_walletInstance) {
    _walletInstance = createMantleWallet();
  }
  return _walletInstance;
}

// Convenience getter for the account address
export function getAgentAddress(): `0x${string}` {
  return getMantleWallet().account.address;
}

// Helper: format explorer URL for a tx
export function txUrl(hash: `0x${string}`) {
  return `${config.explorer}/tx/${hash}`;
}

// Helper: format explorer URL for an address
export function addressUrl(address: `0x${string}`) {
  return `${config.explorer}/address/${address}`;
}
