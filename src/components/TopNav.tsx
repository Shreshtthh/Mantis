'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletConnect from './WalletConnect';

function MantisIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
      <path d="M12 22V12" />
      <path d="M20 7l-8 5-8-5" />
    </svg>
  );
}

export default function TopNav() {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Home' },
    { href: '/chat', label: 'Chat' },
    { href: '/dashboard', label: 'Dashboard' },
  ];
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '10px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)',
      backdropFilter: 'blur(24px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      background: 'rgba(12, 12, 14, 0.82)',
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
        <div className="mantis-mark" style={{ width: 32, height: 32, borderRadius: 9 }}>
          <MantisIcon size={16} />
        </div>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '1.05rem',
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Mantis
        </span>
        <span style={{
          fontSize: '0.65rem',
          padding: '2px 8px',
          background: 'var(--accent-glow)',
          color: 'var(--accent)',
          border: '1px solid rgba(226,164,57,0.2)',
          borderRadius: 'var(--radius-pill)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          Testnet
        </span>
      </Link>
      {/* Nav links */}
      <nav className="nav">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${path === link.href ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {/* Wallet Connect + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <WalletConnect />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot dot-green" />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>Mantle Sepolia</span>
        </div>
      </div>
    </header>
  );
}
