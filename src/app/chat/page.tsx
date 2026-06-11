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
  'Get me a swap quote: 100 USDC → mETH',
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
  } catch { /* corrupted data — start fresh */ }
  return [];
}

export default function ChatPage() {
  // Restore chat history from sessionStorage so messages persist across
  // page navigations (chat → dashboard → chat).  sessionStorage auto-clears
  // when the tab closes, so stale data won't leak across sessions.
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
      } catch { /* quota exceeded — oldest messages will survive */ }
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
      gridTemplateColumns: '1fr 320px',
      height: 'calc(100vh - 57px)',
      gap: 0,
    }}>

      {/* ---- CHAT PANEL ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              paddingTop: '10vh',
              animation: 'fadeIn 0.4s ease',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🦂</div>
              <h2 style={{ marginBottom: 8, fontSize: '1.5rem' }}>Mantis is ready</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: '0.9rem' }}>
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
              }}>
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
              <div className="message-avatar">🦂</div>
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
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              color: 'var(--red)',
              fontSize: '0.875rem',
            }}>
              ⚠️ {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(7,11,26,0.9)',
          backdropFilter: 'blur(12px)',
        }}>
          <form onSubmit={handleSubmit} className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Mantis anything… (Enter to send, Shift+Enter for new line)"
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
            Mantis is on <strong style={{ color: 'var(--yellow)' }}>Mantle Sepolia testnet</strong> — no real money at risk
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
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h4 style={{ marginBottom: 12, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Agent
          </h4>
          <AgentProfile />
        </div>

        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h4 style={{ marginBottom: 4, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Guardrails
          </h4>
          <GuardrailPanel />
        </div>

        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h4 style={{ marginBottom: 12, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Recent Activity
          </h4>
          <AuditTrail limit={5} compact />
        </div>

        <div style={{ padding: '20px 16px' }}>
          <h4 style={{ marginBottom: 12, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Emergency
          </h4>
          <KillSwitch />
        </div>
      </div>
    </div>
  );
}
