'use client';

import { useState, useEffect } from 'react';

interface Position {
  positionId: string;
  market: string;
  side: 'long' | 'short';
  sizeUsd: number;
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  liquidationPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: string;
}

interface Props {
  positions?: Position[];
}

export default function PositionTracker({ positions: externalPositions }: Props) {
  const [positions, setPositions] = useState<Position[]>(externalPositions ?? []);
  const [loading, setLoading] = useState(!externalPositions);

  useEffect(() => {
    if (!externalPositions) {
      loadPositions();
    }
  }, []);

  useEffect(() => {
    if (externalPositions) {
      setPositions(externalPositions);
    }
  }, [externalPositions]);

  async function loadPositions() {
    setLoading(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setPositions(data.positions ?? []);
    } catch {
      // Empty state
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 60 }} />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '24px 16px',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
        No open positions
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {positions.map((pos) => {
        const isPnlPositive = pos.unrealizedPnlUsd >= 0;
        const pnlColor = isPnlPositive ? 'var(--green)' : 'var(--red)';
        const sideColor = pos.side === 'long' ? 'var(--green)' : 'var(--red)';

        return (
          <div
            key={pos.positionId}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {pos.market}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 100,
                    background: pos.side === 'long' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: sideColor,
                    border: `1px solid ${pos.side === 'long' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    textTransform: 'uppercase',
                  }}
                >
                  {pos.side} {pos.leverage}x
                </span>
              </div>
              <div style={{ fontWeight: 700, color: pnlColor, fontSize: '0.95rem' }}>
                {isPnlPositive ? '+' : ''}${pos.unrealizedPnlUsd.toFixed(2)}
                <span style={{ fontSize: '0.75rem', marginLeft: 4, opacity: 0.8 }}>
                  ({isPnlPositive ? '+' : ''}{pos.unrealizedPnlPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Detail grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div>
                <div className="stat-label">Size</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>${pos.sizeUsd.toFixed(0)}</div>
              </div>
              <div>
                <div className="stat-label">Entry</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>${pos.entryPrice.toLocaleString()}</div>
              </div>
              <div>
                <div className="stat-label">Current</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>${pos.currentPrice.toLocaleString()}</div>
              </div>
              <div>
                <div className="stat-label">Liq. Price</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--red)' }}>${pos.liquidationPrice.toLocaleString()}</div>
              </div>
            </div>

            {/* TP/SL row */}
            {(pos.stopLoss || pos.takeProfit) && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.75rem' }}>
                {pos.takeProfit && (
                  <span style={{ color: 'var(--green)' }}>
                    TP: ${pos.takeProfit.toLocaleString()}
                  </span>
                )}
                {pos.stopLoss && (
                  <span style={{ color: 'var(--red)' }}>
                    SL: ${pos.stopLoss.toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
