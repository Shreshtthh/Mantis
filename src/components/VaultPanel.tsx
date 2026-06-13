'use client';

import { useState, useEffect } from 'react';

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

export default function VaultPanel() {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    fetchVault();
    const interval = setInterval(fetchVault, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer for pending withdrawal
  useEffect(() => {
    if (!vault?.pendingWithdrawal) {
      setCountdown(null);
      return;
    }
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockAt = Number(vault.pendingWithdrawal!.unlockAt);
      if (now >= unlockAt) {
        setCountdown('Ready to execute');
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

  async function fetchVault() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.vault) setVault(data.vault);
    } catch {
      // Vault not deployed or RPC down
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = () => {
    if (vault?.address) {
      navigator.clipboard.writeText(vault.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Loading vault state...
      </div>
    );
  }

  if (!vault) {
    return (
      <div style={{ padding: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        AgentVault not deployed or unreachable.
      </div>
    );
  }

  const shortVault = `${vault.address.slice(0, 6)}...${vault.address.slice(-4)}`;
  const shortAgent = `${vault.agent.slice(0, 6)}...${vault.agent.slice(-4)}`;
  const shortOwner = vault.owner
    ? `${vault.owner.slice(0, 6)}...${vault.owner.slice(-4)}`
    : 'Not set';
  const dailyPct =
    Number(vault.maxDailySpendUsd) > 0
      ? ((Number(vault.dailySpentUsd) / Number(vault.maxDailySpendUsd)) * 100).toFixed(0)
      : '0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          AGENT VAULT
        </div>
        {vault.paused ? (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(239,68,68,0.15)',
              color: 'var(--red)',
              fontWeight: 600,
            }}
          >
            PAUSED
          </span>
        ) : (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(34,197,94,0.15)',
              color: 'var(--green)',
              fontWeight: 600,
            }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {/* Vault Address */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.75rem',
        }}
      >
        <code style={{ color: 'var(--accent-bright)', fontSize: '0.8rem' }}>{shortVault}</code>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>

      {/* Roles */}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <div>Agent: <span style={{ color: 'var(--text-secondary)' }}>{shortAgent}</span></div>
        <div>Owner: <span style={{ color: 'var(--text-secondary)' }}>{shortOwner}</span></div>
      </div>

      {/* Guardrails */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>
          ON-CHAIN GUARDRAILS
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Max Single Trade</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            ${Number(vault.maxSingleTradeUsd).toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Max Daily Spend</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            ${Number(vault.maxDailySpendUsd).toLocaleString()}
          </span>
        </div>

        {/* Daily spend bar */}
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              marginBottom: 2,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Spent Today</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              ${Number(vault.dailySpentUsd).toLocaleString()} / ${Number(vault.maxDailySpendUsd).toLocaleString()}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 4,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(Number(dailyPct), 100)}%`,
                height: '100%',
                background:
                  Number(dailyPct) > 80
                    ? 'var(--red)'
                    : Number(dailyPct) > 50
                    ? '#f59e0b'
                    : 'var(--green)',
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Timelock Info */}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        Withdrawal Timelock: {Number(vault.withdrawalDelay) > 0 ? `${Number(vault.withdrawalDelay) / 3600} hour(s)` : 'Disabled'}
      </div>

      {/* Pending Withdrawal */}
      {vault.pendingWithdrawal && (
        <div
          style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 6,
            padding: 10,
          }}
        >
          <div
            style={{ fontSize: '0.65rem', color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}
          >
            PENDING WITHDRAWAL
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
            {Number(vault.pendingWithdrawal.amount).toFixed(0)} tokens pending
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Unlocks in: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{countdown}</span>
          </div>
        </div>
      )}
    </div>
  );
}
