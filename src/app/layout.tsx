import type { Metadata } from 'next';
import './global.css';
import TopNav from '@/components/TopNav';
export const metadata: Metadata = {
  title: 'Mantis | Autonomous DeFi Agent on Mantle',
  description:
    'Mantis is a self-auditing AI agent with its own on-chain identity, wallet, and guardrails. Manages your money across Mantle DeFi and Byreal Perps through natural language.',
  keywords: ['DeFi', 'AI agent', 'Mantle', 'Byreal', 'ERC-8004', 'autonomous trading', 'blockchain'],
  openGraph: {
    title: 'Mantis | Autonomous DeFi Agent',
    description: 'Sharp. Precise. Self-auditing. Your AI agent on Mantle.',
    type: 'website',
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <TopNav />
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
