'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DepositWithdraw from '@/components/DepositWithdraw';
import VaultPanel from '@/components/VaultPanel';
import YieldTable from '@/components/YieldTable';
import PositionTracker from '@/components/PositionTracker';
import ActivityLog from '@/components/ActivityLog';
import GuardrailPanel from '@/components/GuardrailPanel';
import KillSwitch from '@/components/KillSwitch';

interface StatusData {
  network: string;
  wallet: {
    mantleTreasury: {
      address: string;
      tokens: Array<{ symbol: string; balanceFormatted: number; valueUsd: number }>;
      totalValueUsd: number;
    };
  } | null;
  guardrails: {
    killSwitch: boolean;
    circuitBreakerTripped: boolean;
    dailyLossUsd: number;
    dailyLossLimitUsd: number;
  } | null;
  gas: { gwei: number; formatted: string } | null;
  timestamp: string;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      // Keep previous state
    } finally {
      setLoading(false);
    }
  }

  const tokens = status?.wallet?.mantleTreasury?.tokens ?? [];
  const totalValue = status?.wallet?.mantleTreasury?.totalValueUsd ?? 0;
  const gasGwei = status?.gas?.gwei ?? 0;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px 64px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Real-time portfolio, positions, and agent status
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Last updated: {lastRefresh || '—'}
          </span>
          <button onClick={fetchStatus} className="btn btn-ghost btn-sm" disabled={loading}>
            {loading ? '⟳' : '↻'} Refresh
          </button>
          <Link href="/chat" className="btn btn-primary btn-sm">
            Open Chat →
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 28,
      }}>
        <StatCard
          label="Total Portfolio"
          value={`$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          loading={loading}
          accent="blue"
        />
        <StatCard
          label="Tokens Held"
          value={tokens.filter(t => t.balanceFormatted > 0).length.toString()}
          loading={loading}
          accent="green"
        />
        <StatCard
          label="Daily Loss"
          value={`$${status?.guardrails?.dailyLossUsd?.toFixed(2) ?? '0.00'} / $${status?.guardrails?.dailyLossLimitUsd ?? 200}`}
          loading={loading}
          accent={(status?.guardrails?.dailyLossUsd ?? 0) > 100 ? 'red' : 'green'}
        />
        <StatCard
          label="Gas Price"
          value={gasGwei ? `${gasGwei.toFixed(2)} Gwei` : '—'}
          loading={loading}
          accent="default"
        />
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 24,
      }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Token Balances */}
          <DashboardCard title="Token Balances" icon="💼">
            {loading ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : tokens.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Balance</th>
                      <th>Value (USD)</th>
                      <th>Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens
                      .filter(t => t.balanceFormatted > 0)
                      .sort((a, b) => b.valueUsd - a.valueUsd)
                      .map((token) => {
                        const pct = totalValue > 0 ? (token.valueUsd / totalValue * 100) : 0;
                        return (
                          <tr key={token.symbol}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{token.symbol}</td>
                            <td>{token.balanceFormatted.toFixed(4)}</td>
                            <td style={{ color: 'var(--blue-bright)' }}>${token.valueUsd.toFixed(2)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  flex: 1,
                                  height: 6,
                                  background: 'rgba(255,255,255,0.06)',
                                  borderRadius: 100,
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--blue-primary), var(--blue-bright))',
                                    borderRadius: 100,
                                    transition: 'width 0.5s ease',
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: '0.85rem' }}>
                No tokens detected. Fund the agent wallet to get started.
              </div>
            )}
          </DashboardCard>

          {/* Yield Comparison */}
          <DashboardCard title="Yield Comparison" icon="📊">
            <YieldTable />
          </DashboardCard>

          {/* Open Positions */}
          <DashboardCard title="Byreal Perps Positions" icon="📈">
            <PositionTracker />
          </DashboardCard>

          {/* Activity Log */}
          <DashboardCard title="Recent Activity" icon="📋">
            <ActivityLog limit={10} />
          </DashboardCard>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Deposit/Withdraw */}
          <DashboardCard title="Deposit / Withdraw" icon="💸">
            <DepositWithdraw />
          </DashboardCard>

          {/* Vault Status */}
          <DashboardCard title="AgentVault" icon="🏦">
            <VaultPanel />
          </DashboardCard>

          {/* Guardrails */}
          <DashboardCard title="Guardrails" icon="🛡️">
            <GuardrailPanel />
          </DashboardCard>

          {/* Kill Switch */}
          <DashboardCard title="Emergency" icon="🚨">
            <KillSwitch />
          </DashboardCard>

          {/* Network Info */}
          <DashboardCard title="Network" icon="🌐">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label">Chain</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--yellow)' }}>
                  {status?.network === 'testnet' ? 'Mantle Sepolia' : 'Mantle Mainnet'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label">Gas</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {gasGwei ? `${gasGwei.toFixed(2)} Gwei` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label">Agent Version</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  v2.0.0
                </span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({ label, value, loading, accent }: {
  label: string;
  value: string;
  loading: boolean;
  accent: 'blue' | 'green' | 'red' | 'default';
}) {
  const accentColors = {
    blue: { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.15)', color: 'var(--blue-bright)' },
    green: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)', color: 'var(--green)' },
    red: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)', color: 'var(--red)' },
    default: { bg: 'rgba(255,255,255,0.03)', border: 'var(--border-subtle)', color: 'var(--text-primary)' },
  };
  const c = accentColors[accent];

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
    }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>{label}</div>
      {loading ? (
        <div className="skeleton" style={{ height: 24, width: 80 }} />
      ) : (
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: c.color }}>
          {value}
        </div>
      )}
    </div>
  );
}

function DashboardCard({ title, icon, children }: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
