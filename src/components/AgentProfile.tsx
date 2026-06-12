'use client';

import { useState, useEffect } from 'react';

interface AgentProfileData {
  address: string;
  name: string;
  version: string;
  description: string;
  tokenId: string | null;
  identity: {
    name: string;
    description: string;
    registeredAt: string;
  } | null;
  reputation: {
    score: number;
    totalRatings: number;
  } | null;
}

export default function AgentProfile() {
  const [profile, setProfile] = useState<AgentProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.success) {
          setProfile({
            address: data.wallet?.mantleTreasury?.address ?? '—',
            name: 'Mantis AI Agent',
            version: 'v1.0.0',
            description: 'Autonomous DeFi agent on Mantle',
            tokenId: null,
            identity: null,
            reputation: null,
          });
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading) return <div className="skeleton" style={{ height: 160 }} />;
  if (!profile) return null;

  const truncatedAddr = profile.address.length > 10
    ? `${profile.address.slice(0, 6)}...${profile.address.slice(-4)}`
    : profile.address;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48,
          height: 48,
          background: 'linear-gradient(135deg, #1e3a5f, #1e40af)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          boxShadow: '0 0 20px rgba(59,130,246,0.25)',
          flexShrink: 0,
        }}>
          🦂
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <strong style={{ fontSize: '1rem' }}>{profile.name}</strong>
            <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>ERC-8004</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{profile.version}</div>
        </div>
      </div>

      {/* Address */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.85rem',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
      }}>
        <span style={{ color: 'var(--text-muted)' }}>Wallet</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--blue-bright)',
          fontSize: '0.8rem',
        }}>
          {truncatedAddr}
        </span>
      </div>

      {/* Reputation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.85rem',
      }}>
        <span style={{ color: 'var(--text-muted)' }}>Reputation</span>
        <span style={{ color: 'var(--green)', fontWeight: 600 }}>
          {profile.reputation ? `${profile.reputation.score}/100` : '100/100'}
        </span>
      </div>

      {/* Token ID */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.85rem',
      }}>
        <span style={{ color: 'var(--text-muted)' }}>Identity NFT</span>
        <span style={{ color: profile.tokenId ? 'var(--blue-bright)' : 'var(--text-muted)' }}>
          {profile.tokenId ? `#${profile.tokenId}` : 'Not minted'}
        </span>
      </div>
    </div>
  );
}
