/**
 * Client-side wallet connection utility (MetaMask / window.ethereum)
 *
 * No wagmi — keeps bundle small. Uses window.ethereum directly.
 *
 * Exports:
 * - connectWallet()       → { address, chainId }
 * - getConnectedAddress() → reads from localStorage
 * - disconnectWallet()    → clears state
 * - sendDeposit(to, amount, token) → user signs a transfer to agent wallet
 * - isCorrectChain()      → checks Mantle (5000) or Mantle Sepolia (5003)
 * - switchToMantle()      → requests chain switch via MetaMask
 */
import type { ConnectedWallet } from './types';
const MANTLE_MAINNET_ID = 5000;
const MANTLE_SEPOLIA_ID = 5003;
const SUPPORTED_CHAINS = [MANTLE_MAINNET_ID, MANTLE_SEPOLIA_ID];
const STORAGE_KEY = 'mantis_connected_wallet';
// Minimal ERC-20 ABI for transfer
const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
function getEthereum() {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}
export async function connectWallet(): Promise<ConnectedWallet> {
  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error('MetaMask not detected. Please install MetaMask to connect your wallet.');
  }
  const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask.');
  }
  const chainIdHex = (await ethereum.request({ method: 'eth_chainId' })) as string;
  const chainId = parseInt(chainIdHex, 16);
  const isCorrectChain = SUPPORTED_CHAINS.includes(chainId);
  const wallet: ConnectedWallet = {
    address: accounts[0] as `0x${string}`,
    chainId,
    isCorrectChain,
  };
  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: wallet.address, chainId: wallet.chainId }));
  }
  return wallet;
}
export function getConnectedAddress(): `0x${string}` | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const { address } = JSON.parse(stored);
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if the stored wallet connection is still valid.
 * Returns true if MetaMask is installed AND the stored address
 * matches one of the currently-authorized accounts.
 *
 * Call this on mount to detect stale connections (e.g., user
 * disconnected MetaMask since last visit).
 */
export async function verifyWalletConnection(): Promise<boolean> {
  const ethereum = getEthereum();
  if (!ethereum) return false;

  const stored = getConnectedAddress();
  if (!stored) return false;

  try {
    const accounts = (await ethereum.request({ method: 'eth_accounts' })) as string[];
    return accounts.some(
      (a) => a.toLowerCase() === stored.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Refresh the wallet connection state. Reads the stored address
 * and re-verifies with MetaMask. If the connection is stale
 * (e.g., MetaMask disconnected, account changed), clears the
 * stored state and returns null.
 *
 * Call this on page load / component mount.
 */
export async function refreshWalletConnection(): Promise<ConnectedWallet | null> {
  const ethereum = getEthereum();
  if (!ethereum) {
    disconnectWallet();
    return null;
  }

  try {
    const accounts = (await ethereum.request({ method: 'eth_accounts' })) as string[];
    if (!accounts || accounts.length === 0) {
      disconnectWallet();
      return null;
    }

    const chainIdHex = (await ethereum.request({ method: 'eth_chainId' })) as string;
    const chainId = parseInt(chainIdHex, 16);
    const isCorrectChain = SUPPORTED_CHAINS.includes(chainId);

    const wallet: ConnectedWallet = {
      address: accounts[0] as `0x${string}`,
      chainId,
      isCorrectChain,
    };

    // Update localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        address: wallet.address,
        chainId: wallet.chainId,
      }));
    }

    return wallet;
  } catch {
    disconnectWallet();
    return null;
  }
}
export function disconnectWallet(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
export function isCorrectChain(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}
export async function switchToMantle(): Promise<void> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error('MetaMask not detected');
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x138B' }], // 5003 = Mantle Sepolia
    });
  } catch (switchError: any) {
    // Chain not added yet — add it
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x138B',
            chainName: 'Mantle Sepolia Testnet',
            nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.mantle.xyz'],
            blockExplorerUrls: ['https://explorer.sepolia.mantle.xyz'],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
/**
 * Send native MNT from user wallet to the agent address.
 * User signs the tx in MetaMask.
 */
export async function sendNativeDeposit(
  toAddress: string,
  amountMnt: number
): Promise<string> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error('MetaMask not detected');
  const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts[0];
  // Convert MNT amount to wei (18 decimals)
  const weiHex = '0x' + BigInt(Math.floor(amountMnt * 1e18)).toString(16);
  const txHash = (await ethereum.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: toAddress,
        value: weiHex,
      },
    ],
  })) as string;
  return txHash;
}
