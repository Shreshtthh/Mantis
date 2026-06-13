'use client';

import { useState, useEffect } from 'react';
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  refreshWalletConnection,
  switchToMantle,
  isCorrectChain,
} from '@/lib/wallet-connect';
import type { ConnectedWallet } from '@/lib/types';

export default function WalletConnect() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verify stored connection on mount — checks that MetaMask is still
  // actually connected, not just that localStorage has a stale address.
  useEffect(() => {
    (async () => {
      const stored = getConnectedAddress();
      if (!stored) return; // No stored connection

      const refreshed = await refreshWalletConnection();
      if (refreshed) {
        setWallet(refreshed);
      }
      // If refresh fails (MetaMask not connected, account removed),
      // wallet stays null → shows "Connect Wallet" button.
    })();
  }, []);

  // Listen for MetaMask account/chain changes and disconnection
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected all accounts in MetaMask
        disconnectWallet();
        setWallet(null);
      } else {
        const chainIdHex = (ethereum as any).chainId ?? '0x138B';
        const chainId = parseInt(chainIdHex, 16);
        setWallet({
          address: accounts[0] as `0x${string}`,
          chainId,
          isCorrectChain: isCorrectChain(chainId),
        });
      }
    };

    const handleChainChanged = () => {
      // Re-read chain from MetaMask
      window.location.reload();
    };

    const handleDisconnect = () => {
      disconnectWallet();
      setWallet(null);
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);
    ethereum.on('disconnect', handleDisconnect);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
      ethereum.removeListener('disconnect', handleDisconnect);
    };
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await connectWallet();
      if (!w.isCorrectChain) {
        await switchToMantle();
        w.chainId = 5003;
        w.isCorrectChain = true;
      }
      setWallet(w);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setWallet(null);
  };

  if (wallet) {
    const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: 'var(--accent-glow)',
            border: '1px solid rgba(226,164,57,0.2)',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.8rem',
            color: 'var(--accent-bright)',
            cursor: 'pointer',
          }}
          onClick={handleDisconnect}
          title="Click to disconnect"
        >
          <span className="dot dot-green" />
          {shortAddr}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="btn btn-primary btn-sm"
        style={{ fontSize: '0.8rem', padding: '6px 14px' }}
      >
        {loading ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && (
        <div style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
