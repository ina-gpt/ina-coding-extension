import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, InlineCode } from './CodeBlock';

interface MarkdownProps {
  content: string;
  className?: string;
}

export const Markdown: React.FC<MarkdownProps> = memo(({ content, className = '' }) => {
  const CodeComponent: React.FC<{ inline?: boolean; className?: string; children?: React.ReactNode }> = ({ inline, className: cn, children }) => {
    const codeContent = String(children).replace(/\n$/, '');
    const match = /language-(\w+)/.exec(cn || '');
    const language = match ? match[1] : '';

    // Extract filename from first line comment
    let filename: string | undefined;
    let displayCode = codeContent;
    const firstLine = codeContent.split('\n')[0];
    const fnMatch = firstLine.match(/^\/\/\s*(.+\.\w+)\s*$/) || firstLine.match(/^#\s*(.+\.\w+)\s*$/);
    if (fnMatch) { filename = fnMatch[1]; displayCode = codeContent.split('\n').slice(1).join('\n'); }

    if (inline) { return <InlineCode>{children}</InlineCode>; }

    return <CodeBlock code={displayCode} language={language} filename={filename} showLineNumbers={displayCode.split('\n').length > 3} />;
  };

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeComponent as never,
          a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--vscode-textLink-foreground)] hover:underline">{children}</a>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-6 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-6 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h3>,
          blockquote: ({ children }) => <blockquote className="my-3 pl-4 border-l-4 border-[var(--vscode-textBlockQuote-border)] bg-[var(--vscode-textBlockQuote-background)] py-2 italic">{children}</blockquote>,
          table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border border-[var(--vscode-panel-border)] px-3 py-2 text-left font-semibold bg-[var(--vscode-editor-background)]">{children}</th>,
          td: ({ children }) => <td className="border border-[var(--vscode-panel-border)] px-3 py-2">{children}</td>,
          hr: () => <hr className="my-4 border-t border-[var(--vscode-panel-border)]" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

Markdown.displayName = 'Markdown';
