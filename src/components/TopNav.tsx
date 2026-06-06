'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      background: 'rgba(7, 11, 26, 0.85)',
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <div style={{
          width: 32,
          height: 32,
          background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          boxShadow: '0 0 15px rgba(59,130,246,0.3)',
        }}>
          🦂
        </div>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Mantis
        </span>
        <span style={{
          fontSize: '0.7rem',
          padding: '2px 7px',
          background: 'var(--yellow-glow)',
          color: 'var(--yellow)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 100,
          fontWeight: 500,
        }}>
          TESTNET
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
      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot dot-green" />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mantle Sepolia</span>
      </div>
    </header>
  );
}
