import Link from 'next/link';
import { NETWORK, AGENT_IDENTITY } from '@/agent/config';
export default function LandingPage() {
  const isTestnet = NETWORK === 'testnet';
  const stats = [
    { label: 'Network', value: isTestnet ? 'Mantle Sepolia' : 'Mantle Mainnet', highlight: isTestnet },
    { label: 'Max Leverage', value: '5x', highlight: false },
    { label: 'Daily Loss Limit', value: '$200', highlight: false },
    { label: 'Self-Audit', value: 'On-chain', highlight: true },
  ];
  const capabilities = [
    { icon: '🔄', title: 'Token Swaps', desc: 'Merchant Moe DEX — MNT, USDC, mETH, WETH' },
    { icon: '🏦', title: 'Lending Yield', desc: 'Deposit into Lendle, earn APY automatically' },
    { icon: '📈', title: 'Perps Trading', desc: 'Byreal Perps — BTC, ETH, SOL, GOLD, SILVER, OIL' },
    { icon: '🔍', title: 'Yield Analysis', desc: 'Cross-protocol APY comparison in real-time' },
    { icon: '🔐', title: 'Self-Audit Trail', desc: 'Every action hashed and stored on Mantle forever' },
    { icon: '🛡️', title: 'Tiered Guardrails', desc: 'Hard limits, soft approvals, circuit breakers' },
  ];
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 80 }} className="animate-slideUp">
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          background: 'var(--blue-glow)',
          border: '1px solid var(--border-strong)',
          borderRadius: 100,
          fontSize: '0.8rem',
          color: 'var(--blue-bright)',
          marginBottom: 24,
        }}>
          <span className="dot dot-green" />
          ERC-8004 Agent Identity Active
        </div>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: 20,
          background: 'linear-gradient(135deg, #f1f5f9 30%, #60a5fa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Your Autonomous<br />DeFi Agent on Mantle
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto 36px',
          lineHeight: 1.7,
        }}>
          Mantis manages your money across Mantle DeFi and Byreal Perps through natural language.
          Every decision is permanently logged to the blockchain. Self-auditing. Guardrailed. Transparent.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/chat" className="btn btn-primary btn-lg">
            Start Chatting
            <span>→</span>
          </Link>
          <Link href="/dashboard" className="btn btn-secondary btn-lg">
            View Dashboard
          </Link>
        </div>
      </div>
      {/* Agent Identity Card */}
      <div className="card" style={{
        padding: '32px',
        marginBottom: 48,
        background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.08), rgba(13, 18, 37, 0.9))',
        borderColor: 'var(--border-strong)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #1e3a5f, #1e40af)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            boxShadow: '0 0 30px rgba(59,130,246,0.3)',
            flexShrink: 0,
          }}>
            🦂
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>{AGENT_IDENTITY.name}</h2>
              <span className="badge badge-blue">ERC-8004</span>
              {isTestnet && <span className="badge badge-yellow">TESTNET</span>}
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{AGENT_IDENTITY.description}</p>
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
        }}>
          {stats.map((stat) => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
            }}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value" style={{
                fontSize: '1rem',
                color: stat.highlight ? 'var(--blue-bright)' : 'var(--text-primary)',
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Capabilities Grid */}
      <h2 style={{ marginBottom: 24, textAlign: 'center' }}>What Mantis Can Do</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 64,
      }}>
        {capabilities.map((cap) => (
          <div key={cap.title} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{cap.icon}</div>
            <h3 style={{ marginBottom: 6 }}>{cap.title}</h3>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>{cap.desc}</p>
          </div>
        ))}
      </div>
      {/* Guardrail callout */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.06), rgba(13, 18, 37, 0.9))',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 'var(--radius-xl)',
        padding: '32px',
        textAlign: 'center',
      }}>
        <h3 style={{ marginBottom: 12, color: 'var(--green)' }}>🛡️ Code-Level Guardrails</h3>
        <p style={{ maxWidth: 560, margin: '0 auto', fontSize: '0.9rem' }}>
          Mantis is hard-capped at <strong style={{ color: 'var(--text-primary)' }}>5x leverage</strong>,{' '}
          <strong style={{ color: 'var(--text-primary)' }}>$500 max single trade</strong>, and{' '}
          <strong style={{ color: 'var(--text-primary)' }}>$200 daily loss limit</strong> — enforced at the
          code level, not just in the prompt. The LLM cannot request values outside these bounds because
          Zod rejects them before execution.
        </p>
      </div>
    </div>
  );
}
