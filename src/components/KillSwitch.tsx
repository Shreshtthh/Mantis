'use client';

import { useState, useEffect } from 'react';

function PowerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 11-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export default function KillSwitch() {
  const [loading, setLoading] = useState(false);
  const [engaged, setEngaged] = useState(false);

  // Read the real vault paused state from the status API
  useEffect(() => {
    const fetchPaused = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        // vault.paused is the on-chain paused state from AgentVault
        setEngaged(data?.vault?.paused === true);
      } catch { /* keep current state */ }
    };

    fetchPaused();
    const interval = setInterval(fetchPaused, 10_000);
    return () => clearInterval(interval);
  }, []);

  const toggleKillSwitch = async () => {
    setLoading(true);
    try {
      const prompt = engaged
        ? 'Unpause the vault. Resume all trading.'
        : 'ENGAGE KILL SWITCH. Pause the vault immediately.';

      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      // Re-fetch real state after 2 seconds
      setTimeout(async () => {
        try {
          const res = await fetch('/api/status');
          const data = await res.json();
          setEngaged(data?.vault?.paused === true);
        } catch {}
        setLoading(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to toggle kill switch', err);
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <button
        onClick={toggleKillSwitch}
        disabled={loading}
        className={`kill-switch-btn ${engaged ? 'engaged' : ''}`}
        title={engaged ? 'System Halted: Click to Resume' : 'Emergency Stop All Trading'}
      >
        <PowerIcon />
      </button>
      
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: engaged ? 'var(--red)' : 'var(--text-secondary)', letterSpacing: '0.08em' }}>
        {engaged ? 'SYSTEM HALTED' : 'KILL SWITCH'}
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {engaged 
          ? 'All trading actions are blocked. You must manually resume operations.' 
          : 'Instantly block all trading and token transfers if agent behaves unexpectedly.'}
      </p>
    </div>
  );
}
