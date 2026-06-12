'use client';

import { useState, useEffect } from 'react';

interface AuditEntry {
  action: string;
  created_at: string;
  tx_hash: string | null;
  audit_ipfs_cid: string | null;
  result: { success?: boolean } | string;
}

interface Props {
  limit?: number;
  compact?: boolean;
}

export default function AuditTrail({ limit = 10, compact = false }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res = await fetch(`/api/audit?limit=${limit}`);
        const data = await res.json();
        if (data.success) {
          setEntries(data.entries ?? []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchAudit();
    const interval = setInterval(fetchAudit, 15000);
    return () => clearInterval(interval);
  }, [limit]);

  if (loading) return <div className="skeleton" style={{ height: compact ? 100 : 200 }} />;

  if (entries.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: compact ? '16px 12px' : '40px 20px',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}>
        No actions recorded yet. Execute a trade to generate audit entries.
      </div>
    );
  }

  const isSuccess = (entry: AuditEntry): boolean => {
    if (typeof entry.result === 'object' && entry.result !== null) {
      return entry.result.success !== false;
    }
    return true;
  };

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.slice(0, 5).map((entry, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            padding: '6px 0',
            borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`dot ${isSuccess(entry) ? 'dot-green' : 'dot-red'}`} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{entry.action}</span>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 500 }}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Status</th>
            <th>IPFS CID</th>
            <th>Tx Hash</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i}>
              <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                {new Date(entry.created_at).toLocaleString()}
              </td>
              <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{entry.action}</td>
              <td>
                {isSuccess(entry) ? (
                  <span className="badge badge-green">Success</span>
                ) : (
                  <span className="badge badge-red">Failed</span>
                )}
              </td>
              <td>
                {entry.audit_ipfs_cid ? (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${entry.audit_ipfs_cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem' }}
                  >
                    {entry.audit_ipfs_cid.slice(0, 8)}…{entry.audit_ipfs_cid.slice(-4)} ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td>
                {entry.tx_hash ? (
                  <a
                    href={`https://explorer.sepolia.mantle.xyz/tx/${entry.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem' }}
                  >
                    {entry.tx_hash.slice(0, 8)}… ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
