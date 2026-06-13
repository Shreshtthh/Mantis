'use client';
import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';

interface Props {
  message: UIMessage;
}

function MantisIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
      <path d="M12 22V12" /><path d="M20 7l-8 5-8-5" />
    </svg>
  );
}

/**
 * Extract text content from a UIMessage's parts array.
 * AI SDK v6 uses parts[] instead of a flat `content` string.
 */
function getTextContent(message: UIMessage): string {
  if (!message.parts || message.parts.length === 0) return '';
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  if (!isUser && !isAssistant) return null;

  const content = getTextContent(message);
  if (!content) return null;

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-avatar">
        {isUser ? 'U' : <MantisIcon />}
      </div>
      <div className="message-content">
        {isUser ? (
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>{content}</p>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }: any) => <p style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>{children}</p>,
              code: ({ className, children }: any) => {
                const isBlock = className?.includes('language-');
                return isBlock ? (
                  <pre style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, overflow: 'auto', margin: '8px 0' }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--accent-bright)' }}>{children}</code>
                  </pre>
                ) : (
                  <code style={{ background: 'rgba(226,164,57,0.08)', border: '1px solid rgba(226,164,57,0.15)', borderRadius: 5, padding: '2px 7px', fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--accent-bright)' }}>
                    {children}
                  </code>
                );
              },
              table: ({ children }: any) => (
                <div style={{ overflowX: 'auto', margin: '10px 0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
                </div>
              ),
              th: ({ children }: any) => (
                <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
                  {children}
                </th>
              ),
              td: ({ children }: any) => (
                <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {children}
                </td>
              ),
              a: ({ href, children }: any) => (
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-bright)' }}>
                  {children}
                </a>
              ),
              strong: ({ children }: any) => (
                <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>
              ),
              blockquote: ({ children }: any) => (
                <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 14, margin: '8px 0', color: 'var(--text-secondary)' }}>
                  {children}
                </blockquote>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
