import React, { useMemo } from 'react';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import { postMessage } from '@/utils/vscode';

interface LinkPreviewProps {
  url: string;
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  const faviconUrl = useMemo(() => {
    try {
      const origin = new URL(url).origin;
      return `${origin}/favicon.ico`;
    } catch {
      return null;
    }
  }, [url]);

  const handleOpen = () => {
    postMessage({ type: 'openUrl', url });
  };

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-2 rounded-md',
        'border border-[var(--vscode-widget-border,transparent)]',
        'bg-[var(--vscode-editor-background)]',
        'text-xs max-w-sm',
        'my-1'
      )}
    >
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          className="rounded-sm flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <span
        className="text-[var(--vscode-foreground)] truncate flex-1"
        title={url}
      >
        {domain}
      </span>
      <button
        onClick={handleOpen}
        title="Open link"
        aria-label={`Open ${domain}`}
        className={clsx(
          'flex items-center gap-1 px-2 py-0.5 rounded',
          'text-[var(--vscode-textLink-foreground)]',
          'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
          'transition-colors cursor-pointer',
          'text-xs font-medium'
        )}
      >
        <ExternalLink size={12} />
        Open
      </button>
    </div>
  );
};

export default LinkPreview;
