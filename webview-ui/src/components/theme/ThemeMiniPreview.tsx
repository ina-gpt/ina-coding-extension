import React from 'react';

interface ThemeMiniPreviewProps {
  colors: { bgPrimary: string; bgSecondary: string; textPrimary: string; accentPrimary: string; chatUserBubble: string; chatAssistantBubble: string; codeBlockBg: string };
}

export function ThemeMiniPreview({ colors }: ThemeMiniPreviewProps) {
  return (
    <div className="w-full h-20 rounded border overflow-hidden" style={{ background: colors.bgPrimary, borderColor: colors.bgSecondary }}>
      <div className="h-3 flex items-center px-1" style={{ background: colors.bgSecondary }}>
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: colors.accentPrimary }} />
      </div>
      <div className="p-1 space-y-1">
        <div className="h-2 w-10 rounded-sm ml-auto" style={{ background: colors.chatUserBubble }} />
        <div className="h-3 w-14 rounded-sm" style={{ background: colors.chatAssistantBubble }} />
        <div className="h-2 w-12 rounded-sm" style={{ background: colors.codeBlockBg }} />
      </div>
    </div>
  );
}
