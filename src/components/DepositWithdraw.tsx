'use client';

import { useState, useEffect } from 'react';
import { getConnectedAddress, sendNativeDeposit } from '@/lib/wallet-connect';

interface VaultState {
  address: string;
  agent: string;
  owner: string;
  paused: boolean;
  maxSingleTradeUsd: string;
  maxDailySpendUsd: string;
  dailySpentUsd: string;
  dailyWindowStart: string;
  withdrawalDelay: string;
  pendingWithdrawal: {
    amount: string;
    token: string;
    unlockAt: string;
  } | null;
}

const TOKENS = ['MNT', 'USDC', 'USDT', 'WETH', 'mETH'] as const;

export default function DepositWithdraw() {
  const [vaultAddress, setVaultAddress] = useState<string>('');
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [vault, setVault] = useState<VaultState | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<string>('MNT');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown for pending withdrawal
  useEffect(() => {
    if (!vault?.pendingWithdrawal) {
      setCountdown(null);
      return;
    }
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockAt = Number(vault.pendingWithdrawal!.unlockAt);
      if (now >= unlockAt) {
        setCountdown('Ready — execute now!');
        return;
      }
      const remaining = unlockAt - now;
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [vault?.pendingWithdrawal]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.vault) {
        setVault(data.vault);
        setVaultAddress(data.vault.address);
        setVaultBalance(data.vault.totalValueUsd ?? data.wallet?.mantleTreasury?.totalValueUsd ?? 0);
      } else if (data.wallet?.mantleTreasury) {
        // Fallback: show agent wallet when vault not deployed
        setVaultAddress(data.wallet.mantleTreasury.address);
        setVaultBalance(data.wallet.mantleTreasury.totalValueUsd ?? 0);
      }
    } catch {}
  }

  const handleCopy = () => {
    if (vaultAddress) {
      navigator.clipboard.writeText(vaultAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;

    setLoading(true);
    setMessage(null);
    try {
      if (depositToken === 'MNT') {
        // Native MNT deposit
        const txHash = await sendNativeDeposit(vaultAddress, amount);
        setMessage({ type: 'success', text: `Deposit sent! Tx: ${txHash.slice(0, 12)}…` });
      } else {
        // ERC-20 deposit — user needs to call token.transfer(vault, amount) from MetaMask
        setMessage({
          type: 'success',
          text: `Send ${amount} ${depositToken} to AgentVault (${vaultAddress.slice(0, 8)}…) from your MetaMask.`,
        });
      }
      setDepositAmount('');
      setTimeout(fetchStatus, 5000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Deposit failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (!vaultAddress) return;
    setMessage(null);

    try {
      // Show user what they need to do — they sign requestWithdrawal from MetaMask
      // Encoded calldata is provided via the chat tool (withdrawFunds)
      setMessage({
        type: 'success',
        text: `To withdraw: use the chat and say "withdraw X ${depositToken} to 0x..." — Mantis will provide the encoded transaction for you to sign.`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Withdrawal request failed' });
    }
  };

  const shortVault = vaultAddress ? `${vaultAddress.slice(0, 8)}…${vaultAddress.slice(-6)}` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Vault Info */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
          AGENT VAULT ADDRESS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ fontSize: '0.85rem', color: 'var(--blue-bright)' }}>{shortVault}</code>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓' : 'Copy'}
          </button>
          <a
            href={`https://explorer.sepolia.mantle.xyz/address/${vaultAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.7rem',
              color: 'var(--blue-bright)',
              textDecoration: 'none',
              border: '1px solid var(--blue-bright)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            Explorer ↗
          </a>
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: 8, color: 'var(--text-primary)' }}>
          ${vaultBalance.toFixed(2)}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Funds held in vault — {vault?.paused ? '⚠️ Vault is paused' : '✅ Guardrails active'}
        </div>
      </div>

      {/* Deposit */}
      <div>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
          Deposit to AgentVault
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {TOKENS.map((t) => (
            <button
              key={t}
              onClick={() => setDepositToken(t)}
              style={{
                padding: '4px 10px',
                fontSize: '0.7rem',
                borderRadius: 4,
                background: depositToken === t ? 'var(--blue-bright)' : 'rgba(255,255,255,0.05)',
                color: depositToken === t ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder={`${depositToken} amount`}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
          <button
            onClick={handleDeposit}
            disabled={loading || !depositAmount}
            className="btn btn-primary btn-sm"
          >
            Deposit
          </button>
        </div>
        {depositToken !== 'MNT' && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ERC-20 transfers require you to send tokens directly from MetaMask to the vault address above.
          </div>
        )}
      </div>

      {/* Withdrawal — timelocked owner flow */}
      <div>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
          Withdraw from Vault (Timelocked)
        </label>

        {vault?.pendingWithdrawal ? (
          <div
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 6,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
              Pending Withdrawal
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: 2 }}>
              {Number(vault.pendingWithdrawal.amount).toFixed(0)} tokens
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Unlocks in: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{countdown}</span>
            </div>
            {countdown === 'Ready — execute now!' && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={handleRequestWithdrawal}
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%' }}
                >
                  ✨ Execute Withdrawal
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Use chat to request: &quot;withdraw [amount] [token] to [your address]&quot;
            <br />
            ⚠️ Withdrawals have a {vault?.withdrawalDelay ? Number(vault.withdrawalDelay) / 3600 : 1}-hour timelock.
          </div>
        )}
      </div>

      {/* Feedback */}
      {message && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.8rem',
            background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: message.type === 'success' ? 'var(--green)' : 'var(--red)',
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
