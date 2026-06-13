'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';
import ChatMessage from '@/components/ChatMessage';
import GuardrailPanel from '@/components/GuardrailPanel';
import KillSwitch from '@/components/KillSwitch';
import AgentProfile from '@/components/AgentProfile';
import AuditTrail from '@/components/AuditTrail';

const SUGGESTED_PROMPTS = [
  'What\'s the best yield for USDC right now?',
  'Show me my wallet balance',
  'What\'s my current portfolio?',
  'Get me a swap quote: 100 USDC to mETH',
  'Show me BTC-PERP market info',
  'What\'s my audit trail?',
];

const CHAT_STORAGE_KEY = 'mantis_chat_messages';

/** Restore chat messages from sessionStorage so history survives navigation. */
function loadSavedMessages() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted data, start fresh */ }
  return [];
}

function MantisIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
      <path d="M12 22V12" /><path d="M20 7l-8 5-8-5" />
    </svg>
  );
}

export default function ChatPage() {
  // Restore chat history from sessionStorage so messages persist across
  // page navigations (chat to dashboard to chat). sessionStorage auto-clears
  // when the tab closes, so stale data will not leak across sessions.
  const [savedMessages] = useState(loadSavedMessages);

  // Pass restored messages as initial state to the AI SDK's internal store.
  // The `messages` option is used by the Chat constructor internally.
  const { messages, sendMessage, status, error } = useChat(
    savedMessages.length > 0 ? { messages: savedMessages } as any : {}
  );

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist chat history to sessionStorage so navigation doesn't lose context
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } catch { /* quota exceeded, oldest messages will survive */ }
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    await sendMessage({ text: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      height: 'calc(100vh - 53px)',
      gap: 0,
    }}>

      {/* ---- CHAT PANEL ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              paddingTop: '10vh',
              animation: 'fadeIn 0.5s ease',
            }}>
              <div className="mantis-mark animate-float" style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                margin: '0 auto 20px',
              }}>
                <MantisIcon size={32} />
              </div>
              <h2 style={{ marginBottom: 8, fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>Mantis is ready</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 36, fontSize: '0.9rem' }}>
                Ask me about yields, swap tokens, open perps positions, or check your portfolio.
              </p>

              {/* Suggested prompts */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                maxWidth: 560,
                margin: '0 auto',
              }} className="stagger">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="btn btn-ghost btn-sm"
                    style={{ textAlign: 'left' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={msg.id ?? i} message={msg} />
          ))}

          {isLoading && (
            <div className="message message-assistant animate-fadeIn">
              <div className="message-avatar"><MantisIcon size={16} /></div>
              <div className="message-content" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: 14 }}>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: 'var(--red-glow)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              color: 'var(--red)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(12,12,14,0.92)',
          backdropFilter: 'blur(16px)',
        }}>
          <form onSubmit={handleSubmit} className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Mantis anything... (Enter to send, Shift+Enter for new line)"
              disabled={isLoading}
              rows={1}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={isLoading || !input.trim()}
              id="chat-send-button"
              aria-label="Send message"
            >
              {isLoading ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                  </path>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </form>

          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Mantis is on <strong style={{ color: 'var(--accent)' }}>Mantle Sepolia testnet</strong>: no real money at risk
          </p>
        </div>
      </div>

      {/* ---- SIDEBAR ---- */}
      <div style={{
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflowY: 'auto',
        background: 'var(--bg-surface)',
      }}>
        <SidebarSection title="Agent">
          <AgentProfile />
        </SidebarSection>

        <SidebarSection title="Guardrails">
          <GuardrailPanel />
        </SidebarSection>

        <SidebarSection title="Recent Activity">
          <AuditTrail limit={5} compact />
        </SidebarSection>

        <SidebarSection title="Emergency" noBorder>
          <KillSwitch />
        </SidebarSection>
      </div>
    </div>
  );
}

function SidebarSection({ title, children, noBorder }: { title: string; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div style={{
      padding: '20px 18px',
      borderBottom: noBorder ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <h4 style={{
        marginBottom: 14,
        fontSize: '0.7rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-muted)',
        fontWeight: 600,
      }}>
        {title}
      </h4>
      {children}
    </div>
  );
}
