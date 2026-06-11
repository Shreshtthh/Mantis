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

  const actionIcons: Record<string, string> = {
    swapTokens: '🔄',
    depositLendle: '💰',
    withdrawLendle: '📤',
    openPerpsPosition: '📈',
    closePerpsPosition: '📉',
    perps_market_buy: '🟢',
    perps_market_sell: '🔴',
    perps_close_market: '⏹️',
    withdrawFunds: '💸',
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
        padding: '24px 16px',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        No activity yet. Start chatting to generate actions.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map((entry, i) => {
        const icon = actionIcons[entry.action] ?? '⚡';
        const success = entry.result_success;
        const time = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(entry.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

        return (
          <div
            key={entry.id ?? i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              transition: 'border-color 0.15s ease',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
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
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: 100,
                  background: 'rgba(59,130,246,0.1)',
                  color: 'var(--blue-bright)',
                  border: '1px solid rgba(59,130,246,0.2)',
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
