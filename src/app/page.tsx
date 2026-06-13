import Link from 'next/link';
import { NETWORK, AGENT_IDENTITY } from '@/agent/config';

/* SVG icon components (no emojis) */
function SwapIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}
function VaultIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 8v8" /><path d="M8 12h8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-bright)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
function MantisLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
      <path d="M12 22V12" /><path d="M20 7l-8 5-8-5" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function LandingPage() {
  const isTestnet = NETWORK === 'testnet';
  const stats = [
    { label: 'Network', value: isTestnet ? 'Mantle Sepolia' : 'Mantle Mainnet', highlight: isTestnet },
    { label: 'Max Leverage', value: '5x', highlight: false },
    { label: 'Daily Loss Limit', value: '$200', highlight: false },
    { label: 'Self-Audit', value: 'On-chain', highlight: true },
  ];
  const capabilities = [
    { icon: <SwapIcon />, title: 'Token Swaps', desc: 'Merchant Moe DEX: MNT, USDC, mETH, WETH' },
    { icon: <VaultIcon />, title: 'Lending Yield', desc: 'Deposit into Lendle, earn APY automatically' },
    { icon: <TrendIcon />, title: 'Perps Trading', desc: 'Byreal Perps: BTC, ETH, SOL, GOLD, SILVER, OIL' },
    { icon: <SearchIcon />, title: 'Yield Analysis', desc: 'Cross-protocol APY comparison in real-time' },
    { icon: <ShieldIcon />, title: 'Self-Audit Trail', desc: 'Every action hashed and stored on Mantle forever' },
    { icon: <LockIcon />, title: 'Tiered Guardrails', desc: 'Hard limits, soft approvals, circuit breakers' },
  ];
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 96 }} className="animate-slideUp">
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 18px',
          background: 'var(--accent-glow)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-pill)',
          fontSize: '0.78rem',
          color: 'var(--accent-bright)',
          marginBottom: 28,
          fontWeight: 500,
        }}>
          <span className="dot dot-green" />
          ERC-8004 Agent Identity Active
        </div>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.035em',
          marginBottom: 24,
          lineHeight: 1.1,
          background: 'linear-gradient(135deg, #f0ede8 25%, var(--accent-bright) 55%, var(--teal) 90%)',
          backgroundSize: '200% 200%',
          animation: 'gradientShift 6s ease infinite',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Your Autonomous<br />DeFi Agent on Mantle
        </h1>
        <p style={{
          fontSize: '1.15rem',
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto 40px',
          lineHeight: 1.7,
        }}>
          Mantis manages your money across Mantle DeFi and Byreal Perps through natural language.
          Every decision is permanently logged to the blockchain. Self-auditing. Guardrailed. Transparent.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/chat" className="btn btn-primary btn-lg">
            Start Chatting
            <ArrowRight />
          </Link>
          <Link href="/dashboard" className="btn btn-secondary btn-lg">
            View Dashboard
          </Link>
        </div>
      </div>

      {/* Agent Identity Card */}
      <div className="card" style={{
        padding: '36px',
        marginBottom: 56,
        background: 'linear-gradient(135deg, rgba(226, 164, 57, 0.06), rgba(19, 19, 22, 0.92))',
        borderColor: 'var(--border-strong)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 32 }}>
          <div className="mantis-mark" style={{
            width: 64,
            height: 64,
            borderRadius: 18,
          }}>
            <MantisLogo />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{AGENT_IDENTITY.name}</h2>
              <span className="badge badge-blue">ERC-8004</span>
              {isTestnet && <span className="badge badge-yellow">TESTNET</span>}
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{AGENT_IDENTITY.description}</p>
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
        }} className="stagger">
          {stats.map((stat) => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
            }}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value" style={{
                fontSize: '1rem',
                color: stat.highlight ? 'var(--accent-bright)' : 'var(--text-primary)',
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities Grid */}
      <h2 style={{ marginBottom: 28, textAlign: 'center', fontFamily: 'var(--font-display)' }}>What Mantis Can Do</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
        marginBottom: 72,
      }} className="stagger">
        {capabilities.map((cap) => (
          <div key={cap.title} className="card" style={{ padding: '24px 28px' }}>
            <div style={{ marginBottom: 14 }}>{cap.icon}</div>
            <h3 style={{ marginBottom: 6, fontFamily: 'var(--font-display)' }}>{cap.title}</h3>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>{cap.desc}</p>
          </div>
        ))}
      </div>

      {/* Guardrail callout */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.04), rgba(19, 19, 22, 0.92))',
        border: '1px solid rgba(52, 211, 153, 0.15)',
        borderRadius: 'var(--radius-xl)',
        padding: '36px',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h3 style={{ margin: 0, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>Code-Level Guardrails</h3>
        </div>
        <p style={{ maxWidth: 560, margin: '0 auto', fontSize: '0.9rem' }}>
          Mantis is hard-capped at <strong style={{ color: 'var(--text-primary)' }}>5x leverage</strong>,{' '}
          <strong style={{ color: 'var(--text-primary)' }}>$500 max single trade</strong>, and{' '}
          <strong style={{ color: 'var(--text-primary)' }}>$200 daily loss limit</strong>. Enforced at the
          code level, not just in the prompt. The LLM cannot request values outside these bounds because
          Zod rejects them before execution.
        </p>
      </div>
    </div>
  );
}
