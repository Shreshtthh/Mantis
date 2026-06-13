'use client';

import { useState, useEffect } from 'react';

interface ActionEntry {
  id: string;
  action: string;
  params: string;
  result_success: number;
  audit_ipfs_cid: string | null;
  audit_tx_hash: string | null;
  created_at: string;
}

interface Props {
  limit?: number;
}

/* SVG icons for action types */
function SwapIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>;
}
function DepositIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
}
function WithdrawIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
}
function TrendUpIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
}
function TrendDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>;
}
function BoltIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
}

export default function ActivityLog({ limit = 10 }: Props) {
  const [entries, setEntries] = useState<ActionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchActivity() {
    try {
      const res = await fetch(`/api/audit?limit=${limit}&source=local`);
      const data = await res.json();
      if (data.success && data.entries) {
        setEntries(data.entries);
      }
    } catch {
      // Keep existing state
    } finally {
      setLoading(false);
    }
  }

  const getActionIcon = (action: string) => {
    if (action.includes('swap')) return <SwapIcon />;
    if (action.includes('deposit') || action.includes('Deposit')) return <DepositIcon />;
    if (action.includes('withdraw') || action.includes('Withdraw')) return <WithdrawIcon />;
    if (action.includes('buy') || action.includes('open') || action.includes('Open')) return <TrendUpIcon />;
    if (action.includes('sell') || action.includes('close') || action.includes('Close')) return <TrendDownIcon />;
    return <BoltIcon />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 48 }} />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '28px 16px',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 10px' }}>
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
        No activity yet. Start chatting to generate actions.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map((entry, i) => {
        const icon = getActionIcon(entry.action);
        const success = entry.result_success;
        const time = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(entry.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

        return (
          <div
            key={entry.id ?? i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              transition: 'border-color var(--transition-fast), background var(--transition-fast)',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: success ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: success ? 'var(--green)' : 'var(--red)',
              flexShrink: 0,
            }}>
              {icon}
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {formatAction(entry.action)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {date} {time}
              </div>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {entry.audit_ipfs_cid && (
                <span style={{
                  fontSize: '0.6rem',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--accent-glow)',
                  color: 'var(--accent-bright)',
                  border: '1px solid rgba(226,164,57,0.2)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}>
                  IPFS
                </span>
              )}
              <span className={`dot ${success ? 'dot-green' : 'dot-red'}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    swapTokens: 'Token Swap',
    depositLendle: 'Lendle Deposit',
    withdrawLendle: 'Lendle Withdraw',
    openPerpsPosition: 'Perps Open',
    closePerpsPosition: 'Perps Close',
    perps_market_buy: 'Perps Long',
    perps_market_sell: 'Perps Short',
    perps_close_market: 'Perps Close',
    perps_set_tpsl: 'Set TP/SL',
    withdrawFunds: 'Withdrawal',
  };
  return map[action] ?? action.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}
