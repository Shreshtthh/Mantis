'use client';

import { useState, useEffect } from 'react';

interface GuardrailStatus {
  killSwitchEngaged: boolean;
  circuitBreakerEngaged: boolean;
  dailyLossUsd: number;
  dailyLossLimitUsd: number;
  totalTradesToday: number;
}

interface VaultState {
  address?: string;
  paused?: boolean;
  agent?: string;
  owner?: string;
  maxSingleTradeUsd?: number;
  maxDailySpendUsd?: number;
  dailySpentUsd?: number;
  pendingWithdrawal?: { token: string; amount: string; unlockAt: number } | null;
}

export default function GuardrailPanel() {
  const [status, setStatus] = useState<GuardrailStatus | null>(null);
  const [vault, setVault] = useState<VaultState | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.guardrails) {
          setStatus(data.guardrails);
        }
        if (data.vault) {
          setVault(data.vault);
        }
      } catch (err) {
        console.error('Failed to fetch guardrail status', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return <div className="skeleton" style={{ height: 100 }} />;
  }

  const { killSwitchEngaged, circuitBreakerEngaged, dailyLossUsd, dailyLossLimitUsd } = status;
  const lossPercent = Math.min((dailyLossUsd / dailyLossLimitUsd) * 100, 100);

  // Read guardrail values from vault (on-chain) or fall back to defaults
  const maxTrade = vault?.maxSingleTradeUsd ?? 500;
  const maxDaily = vault?.maxDailySpendUsd ?? 2000;
  const dailySpent = vault?.dailySpentUsd ?? 0;
  const dailyPct = maxDaily > 0 ? Math.min((dailySpent / maxDaily) * 100, 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      
      {/* On-chain Vault Rules */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Rules Source</span>
        <span style={{ color: 'var(--green)', fontWeight: 500 }}>On-chain</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Max Single Trade</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${maxTrade.toLocaleString()}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Max Daily Spend</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${maxDaily.toLocaleString()}</span>
      </div>

      {/* Daily Spend Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Daily Spend</span>
          <span style={{ color: dailyPct > 80 ? 'var(--red)' : 'var(--text-primary)' }}>
            ${dailySpent.toLocaleString()} / ${maxDaily.toLocaleString()}
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${dailyPct}%`,
            background: dailyPct > 80 ? 'var(--red)' : dailyPct > 50 ? 'var(--yellow)' : 'var(--green)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

      {/* Daily Loss */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Daily Loss Limit</span>
          <span style={{ color: lossPercent > 80 ? 'var(--red)' : 'var(--text-primary)' }}>
            ${dailyLossUsd.toFixed(2)} / ${dailyLossLimitUsd}
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', 
            width: `${lossPercent}%`, 
            background: lossPercent > 80 ? 'var(--red)' : 'var(--blue-primary)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Status Indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <span className={`dot ${killSwitchEngaged ? 'dot-red' : 'dot-green'}`} />
          <span style={{ color: killSwitchEngaged ? 'var(--red)' : 'var(--text-secondary)' }}>
            Kill Switch {killSwitchEngaged ? 'Engaged' : 'Off'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <span className={`dot ${circuitBreakerEngaged ? 'dot-red' : 'dot-green'}`} />
          <span style={{ color: circuitBreakerEngaged ? 'var(--red)' : 'var(--text-secondary)' }}>
            Circuit Breaker {circuitBreakerEngaged ? 'Tripped' : 'Clear'}
          </span>
        </div>
      </div>
    </div>
  );
}
