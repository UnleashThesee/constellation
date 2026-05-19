import ReactMarkdown from 'react-markdown';

/** Markdown rendu avec styles cohérents Citizen. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="cit-markdown" style={{
      fontFamily: "'Special Elite', monospace",
      fontSize: 13, lineHeight: 1.6, color: 'var(--cit-navy-dk)',
    }}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2 className="cit-h1" style={{ fontSize: 22, lineHeight: 0.95, margin: '12px 0 6px' }}>{children}</h2>,
          h2: ({ children }) => <h3 className="cit-h1" style={{ fontSize: 18, lineHeight: 0.95, margin: '10px 0 4px' }}>{children}</h3>,
          h3: ({ children }) => <h4 className="cit-condensed" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', margin: '8px 0 4px' }}>{children}</h4>,
          p:  ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
          strong: ({ children }) => <strong style={{ color: 'var(--cit-brick)' }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--cit-navy)' }}>{children}</em>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cit-brick)', textDecoration: 'underline' }}>{children}</a>,
          code: ({ children }) => <code style={{ background: 'var(--cit-paper-dk)', padding: '1px 5px', border: '1.5px solid var(--cit-navy-dk)', fontSize: 11 }}>{children}</code>,
          ul: ({ children }) => <ul style={{ margin: '4px 0 8px 0', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0 8px 0', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
          blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--cit-navy-dk)', paddingLeft: 12, margin: '8px 0', fontStyle: 'italic', color: 'var(--cit-navy)' }}>{children}</blockquote>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
