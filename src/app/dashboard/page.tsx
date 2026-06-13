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

/* SVG icons for dashboard cards */
function WalletIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
}
function ChartIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
}
function TrendIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
}
function ClipboardIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>;
}
function ArrowDownIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-bright)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
}
function VaultIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 8v1" /><path d="M12 15v1" /></svg>;
}
function ShieldIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
function AlertIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
}
function GlobeIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;
}
function RefreshIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>;
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
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 28px 72px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 36,
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Real-time portfolio, positions, and agent status
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Last updated: {lastRefresh || '...'}
          </span>
          <button onClick={fetchStatus} className="btn btn-ghost btn-sm" disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
          <Link href="/chat" className="btn btn-primary btn-sm">
            Open Chat
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 32,
      }} className="stagger">
        <StatCard
          label="Total Portfolio"
          value={`$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          loading={loading}
          accent="accent"
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
          value={gasGwei ? `${gasGwei.toFixed(2)} Gwei` : '...'}
          loading={loading}
          accent="default"
        />
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        gap: 24,
      }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Token Balances */}
          <DashboardCard title="Token Balances" icon={<WalletIcon />}>
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
                            <td style={{ color: 'var(--accent-bright)' }}>${token.valueUsd.toFixed(2)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  flex: 1,
                                  height: 5,
                                  background: 'rgba(255,255,255,0.05)',
                                  borderRadius: 'var(--radius-pill)',
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--accent-dim), var(--accent-bright))',
                                    borderRadius: 'var(--radius-pill)',
                                    transition: 'width 0.5s ease',
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
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
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: '0.85rem' }}>
                No tokens detected. Fund the agent wallet to get started.
              </div>
            )}
          </DashboardCard>

          {/* Yield Comparison */}
          <DashboardCard title="Yield Comparison" icon={<ChartIcon />}>
            <YieldTable />
          </DashboardCard>

          {/* Open Positions */}
          <DashboardCard title="Byreal Perps Positions" icon={<TrendIcon />}>
            <PositionTracker />
          </DashboardCard>

          {/* Activity Log */}
          <DashboardCard title="Recent Activity" icon={<ClipboardIcon />}>
            <ActivityLog limit={10} />
          </DashboardCard>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Deposit/Withdraw */}
          <DashboardCard title="Deposit / Withdraw" icon={<ArrowDownIcon />}>
            <DepositWithdraw />
          </DashboardCard>

          {/* Vault Status */}
          <DashboardCard title="AgentVault" icon={<VaultIcon />}>
            <VaultPanel />
          </DashboardCard>

          {/* Guardrails */}
          <DashboardCard title="Guardrails" icon={<ShieldIcon />}>
            <GuardrailPanel />
          </DashboardCard>

          {/* Kill Switch */}
          <DashboardCard title="Emergency" icon={<AlertIcon />}>
            <KillSwitch />
          </DashboardCard>

          {/* Network Info */}
          <DashboardCard title="Network" icon={<GlobeIcon />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label">Chain</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                  {status?.network === 'testnet' ? 'Mantle Sepolia' : 'Mantle Mainnet'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="stat-label">Gas</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {gasGwei ? `${gasGwei.toFixed(2)} Gwei` : '...'}
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
  accent: 'accent' | 'green' | 'red' | 'default';
}) {
  const accentColors = {
    accent: { bg: 'rgba(226,164,57,0.05)', border: 'rgba(226,164,57,0.12)', color: 'var(--accent-bright)' },
    green: { bg: 'rgba(52,211,153,0.05)', border: 'rgba(52,211,153,0.12)', color: 'var(--green)' },
    red: { bg: 'rgba(248,113,113,0.05)', border: 'rgba(248,113,113,0.12)', color: 'var(--red)' },
    default: { bg: 'rgba(255,255,255,0.025)', border: 'var(--border-subtle)', color: 'var(--text-primary)' },
  };
  const c = accentColors[accent];

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '20px 22px',
      transition: 'transform var(--transition-base), box-shadow var(--transition-base)',
    }}>
      <div className="stat-label" style={{ marginBottom: 8 }}>{label}</div>
      {loading ? (
        <div className="skeleton" style={{ height: 24, width: 80 }} />
      ) : (
        <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: c.color }}>
          {value}
        </div>
      )}
    </div>
  );
}

function DashboardCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '22px 26px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
      }}>
        <div className="icon-container">{icon}</div>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
