import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split content by code blocks to separate code and text
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-4">
      {parts.map((part, index) => {
        // If it's a code block
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2].trim() : part.replace(/```/g, '').trim();

          return (
            <div 
              key={index} 
              className="my-4 border-4 border-pg-fg rounded-2xl overflow-hidden bg-pg-fg text-slate-100 font-mono text-xs shadow-hard select-text"
            >
              {lang && (
                <div className="bg-pg-muted text-pg-fg px-4 py-2 border-b-2 border-pg-fg font-sans font-black flex items-center justify-between text-[10px] uppercase tracking-wider select-none">
                  <span>{lang} code block</span>
                </div>
              )}
              <pre className="p-4 overflow-x-auto whitespace-pre select-text">
                <code className="select-text">{code}</code>
              </pre>
            </div>
          );
        }

        // Process inline styles: headers, bullet lists, bold text
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-2">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              
              // 1. Headers (### or ## or #)
              if (trimmed.startsWith('#')) {
                const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
                if (headerMatch) {
                  const level = headerMatch[1].length;
                  const text = headerMatch[2];
                  const renderedText = renderInlineStyles(text);
                  
                  if (level === 1) return <h1 key={lineIdx} className="text-xl font-heading font-black text-pg-fg mt-4 mb-2">{renderedText}</h1>;
                  if (level === 2) return <h2 key={lineIdx} className="text-lg font-heading font-black text-pg-fg mt-3 mb-2">{renderedText}</h2>;
                  return <h3 key={lineIdx} className="text-base font-heading font-black text-pg-fg mt-2 mb-1">{renderedText}</h3>;
                }
              }

              // 2. Bullet lists (* or -)
              if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                const text = trimmed.substring(2);
                return (
                  <ul key={lineIdx} className="list-disc pl-5 my-1 text-sm font-bold text-pg-fg/90">
                    <li>{renderInlineStyles(text)}</li>
                  </ul>
                );
              }

              // 3. Numbered lists (e.g. 1.)
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                const num = numMatch[1];
                const text = numMatch[2];
                return (
                  <ol key={lineIdx} className="list-decimal pl-5 my-1 text-sm font-bold text-pg-fg/90">
                    <li value={parseInt(num)}>{renderInlineStyles(text)}</li>
                  </ol>
                );
              }

              // Normal text line
              if (line === '') return <div key={lineIdx} className="h-1" />;
              return <p key={lineIdx} className="text-sm font-bold text-pg-fg/90 leading-relaxed">{renderInlineStyles(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// Helper to render bold (**text**), code (`code`) inline elements
function renderInlineStyles(text: string): React.ReactNode[] {
  // Regex to split by **bold** or `code`
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);
  
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-black text-pg-fg">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="bg-pg-muted text-pg-accent border border-pg-fg/20 px-1.5 py-0.5 rounded font-mono text-xs select-all">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
