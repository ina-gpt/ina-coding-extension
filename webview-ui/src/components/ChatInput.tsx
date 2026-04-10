import React, { useEffect, useCallback, useState, forwardRef } from 'react';
import { Send, Square, X, FileCode, Loader2, AtSign, Sparkles, Bot } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { ContextDisplay } from './ContextDisplay';
import { MentionAutocomplete, MentionContext as MCtx, MentionSuggestion as MSugg } from './MentionAutocomplete';
import { MentionChipsList } from './MentionChip';
import { SuggestedFilesBar, type SuggestedFile } from './SuggestedFilesBar';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ============ Mention detection helper ============

const MENTION_TYPES = [
  'file', 'folder', 'symbol', 'docs', 'web',
  'codebase', 'selection', 'terminal', 'git', 'problems',
  'recently-changed', 'past-chats', 'open-editors', 'last-command', 'lint-errors',
];

function detectMentionContext(text: string, cursorPos: number): MCtx | null {
  const before = text.slice(0, cursorPos);
  const lastAt = before.lastIndexOf('@');
  if (lastAt === -1) { return null; }

  const afterAt = before.slice(lastAt);
  const spaceIdx = afterAt.indexOf(' ');
  if (spaceIdx !== -1 && !afterAt.endsWith(':')) { return null; }

  let type: string | null = null;
  let query = '';

  const typeMatch = afterAt.match(/^@(\w+):/);
  if (typeMatch && MENTION_TYPES.includes(typeMatch[1])) {
    type = typeMatch[1];
    query = afterAt.slice(typeMatch[0].length);
  } else {
    query = afterAt.slice(1);
  }

  return { query, type: type as any, startIndex: lastAt, isComplete: false };
}

// ============ Component ============

export const ChatInput = forwardRef<HTMLTextAreaElement>((_, ref) => {
  const {
    inputValue, setInputValue, sendMessage, stopGeneration,
    isStreaming, streamingInfo, context, setContext,
    activeContext, isContextEnabled, setContextEnabled,
    mentions, addMention, removeMention, setMentions,
    mentionSuggestions, isMentionLoading, setMentionLoading,
    agentMode, agentSession, connectionState,
  } = useChatStore();

  const [suggestedFiles, setSuggestedFiles] = useState<SuggestedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const uriList = e.dataTransfer.getData('text/uri-list');
    if (uriList) {
      const files = uriList.split('\n').filter(u => u.trim().startsWith('file://'));
      if (files.length > 0) {
        postMessage({ type: 'dropFiles', uris: files } as any);
        return;
      }
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) setInputValue(inputValue + '\n' + text);
  }, [inputValue, setInputValue]);

  const [isFocused, setIsFocused] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [mentionCtx, setMentionCtx] = useState<MCtx | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const internalRef = React.useRef<HTMLTextAreaElement>(null);
  const taRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

  const adjustHeight = useCallback(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`; }
  }, [taRef]);

  useEffect(() => { adjustHeight(); }, [inputValue, adjustHeight]);
  useEffect(() => { taRef.current?.focus(); }, [taRef]);

  // Phase 28 — Listen for suggested files from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'suggestedFiles') { setSuggestedFiles(msg.files || []); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ============ Mention detection on input change ============

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(val);

    const ctx = detectMentionContext(val, cursorPos);
    setMentionCtx(ctx);
    setSelectedIdx(0);

    if (ctx) {
      setMentionLoading(true);
      postMessage({
        type: 'getMentionSuggestions',
        context: { query: ctx.query, type: ctx.type },
      });
    } else {
      // Phase 28 — Send input for suggested files (when not in mention mode)
      postMessage({ type: 'inputChanged', text: val });
    }
  }, [setInputValue, setMentionLoading]);

  // ============ Key handling ============

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Mention autocomplete navigation
    if (mentionCtx && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSuggestion(mentionSuggestions[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionAutocomplete();
        return;
      }
    }

    // Normal input handling
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isStreaming) { sendMessage(inputValue); }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (inputValue.trim() && !isStreaming) { sendMessage(inputValue); }
    }
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      stopGeneration();
    }
  }, [mentionCtx, mentionSuggestions, selectedIdx, inputValue, isStreaming, sendMessage, stopGeneration]);

  // ============ Suggestion selection ============

  const handleSelectSuggestion = useCallback((suggestion: MSugg) => {
    if (!mentionCtx || !taRef.current) { return; }

    const ta = taRef.current;
    const before = inputValue.slice(0, mentionCtx.startIndex);
    const after = inputValue.slice(ta.selectionStart);
    const newValue = before + suggestion.insertText + after;

    setInputValue(newValue);

    // Add as mention chip
    addMention({
      type: suggestion.type as any,
      value: suggestion.value,
      displayName: suggestion.displayName,
    });

    closeMentionAutocomplete();

    // Restore cursor
    setTimeout(() => {
      const newPos = before.length + suggestion.insertText.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }, [mentionCtx, inputValue, taRef, setInputValue, addMention]);

  const closeMentionAutocomplete = useCallback(() => {
    setMentionCtx(null);
    setSelectedIdx(0);
  }, []);

  const handleRemoveMention = useCallback((index: number) => {
    const mention = mentions[index];
    removeMention(index);
    // Remove text representation from input
    const pattern = `@${mention.type}${mention.value ? ':' + mention.value : ''}`;
    const newVal = inputValue.replace(pattern, '').replace(/\s+/g, ' ').trim();
    setInputValue(newVal);
  }, [mentions, removeMention, inputValue, setInputValue]);

  const toggleContext = useCallback(() => {
    setContextEnabled(!isContextEnabled);
  }, [isContextEnabled, setContextEnabled]);

  const stats = streamingInfo ? { dur: Math.round((Date.now() - streamingInfo.startTime) / 1000), tok: streamingInfo.tokensReceived } : null;
  const hasActiveContext = Boolean(activeContext?.activeFile);
  const hasSelection = Boolean(activeContext?.activeFile?.selectedContent);

  return (
    <div className={clsx('border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] relative', isDragOver && 'ring-2 ring-[var(--vscode-focusBorder)]')}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--vscode-editor-background)]/80 border-2 border-dashed border-[var(--vscode-focusBorder)] rounded pointer-events-none">
          <span className="text-sm text-[var(--vscode-descriptionForeground)]">Drop files here to add to chat</span>
        </div>
      )}
      {/* Legacy context (from code actions) */}
      {context && !activeContext?.activeFile && (
        <div className="px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)]">
              <FileCode size={14} />
              {context.file && <span className="font-medium">{context.file.split('/').pop()}</span>}
              {context.selection && <span className="ml-2 opacity-75">L{context.selection.startLine}-{context.selection.endLine}</span>}
            </div>
            <button onClick={() => setContext(null)} className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Active context display */}
      {isContextEnabled && hasActiveContext && (
        <div className="px-3 pt-2">
          <ContextDisplay
            context={activeContext}
            isExpanded={contextExpanded}
            onToggleExpand={() => setContextExpanded(!contextExpanded)}
            onRemoveContext={() => setContextEnabled(false)}
          />
        </div>
      )}

      {/* Mention chips */}
      {mentions.length > 0 && (
        <div className="px-3 pt-2">
          <MentionChipsList
            mentions={mentions}
            onRemove={handleRemoveMention}
          />
        </div>
      )}

      {/* Phase 28 — Suggested files */}
      {suggestedFiles.length > 0 && !isStreaming && (
        <SuggestedFilesBar
          files={suggestedFiles}
          onAddFile={(filePath) => {
            addMention({ type: 'file' as any, value: filePath, displayName: filePath.split('/').pop() || filePath });
            setInputValue(inputValue + (inputValue.endsWith(' ') ? '' : ' '));
            setSuggestedFiles(prev => prev.filter(f => f.relativePath !== filePath));
          }}
          onDismiss={() => setSuggestedFiles([])}
        />
      )}

      {isStreaming && stats && (
        <div className="px-4 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/30">
          <div className="flex items-center gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
            <Loader2 size={12} className="animate-spin" />
            <span>Generating... {stats.tok} tokens in {stats.dur}s</span>
          </div>
        </div>
      )}

      <div className="p-3">
        <div className={clsx('relative flex items-end gap-2 px-3 py-2 rounded-lg border transition-colors',
          isFocused ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-input-background)]' : 'border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]')}>

          {/* Context toggle */}
          <button
            onClick={toggleContext}
            className={clsx(
              'flex-shrink-0 p-1.5 self-end rounded transition-colors',
              'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
              hasActiveContext && isContextEnabled
                ? 'text-[var(--vscode-textLink-foreground)]'
                : 'text-[var(--vscode-descriptionForeground)] opacity-50',
            )}
            title={isContextEnabled ? 'Hide file context' : 'Show file context'}
          >
            <AtSign size={16} />
          </button>

          <textarea ref={taRef} value={inputValue} onChange={handleInputChange} onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
            placeholder={
              isStreaming
                ? (agentSession ? 'Agent is working...' : 'Generating response...')
                : connectionState === 'offline'
                  ? 'You\'re offline. Messages may use local model or be queued...'
                  : connectionState === 'degraded'
                    ? 'Slow connection — responses may take longer...'
                    : agentMode === 'agent'
                      ? 'Describe what you want to build or change across your project...'
                      : agentMode === 'auto'
                        ? "Ask anything \u2014 I'll use Agent mode when needed"
                        : 'Ask INA anything... (@ to mention)'
            }
            rows={1} className="flex-1 bg-transparent border-none outline-none resize-none text-sm placeholder:text-[var(--vscode-input-placeholderForeground)]"
            style={{ maxHeight: '200px' }} />

          <button onClick={() => isStreaming ? stopGeneration() : inputValue.trim() && sendMessage(inputValue)}
            disabled={!inputValue.trim() && !isStreaming}
            className={clsx('p-2 rounded-lg transition-all',
              isStreaming ? 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-[var(--ina-status-error,#ef4444)] hover:opacity-80' : inputValue.trim() ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]' : 'opacity-30 cursor-not-allowed')}
            title={isStreaming ? 'Stop (Esc)' : 'Send (Enter)'}>
            {isStreaming ? <Square size={18} /> : <Send size={18} />}
          </button>

          {/* Mention autocomplete dropdown */}
          <MentionAutocomplete
            context={mentionCtx}
            suggestions={mentionSuggestions}
            isLoading={isMentionLoading}
            selectedIndex={selectedIdx}
            onSelect={handleSelectSuggestion}
            onClose={closeMentionAutocomplete}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-[var(--vscode-descriptionForeground)] opacity-75">
          <div className="flex items-center gap-2">
            {(() => {
              const mentionCount = mentions.length + (hasSelection && isContextEnabled ? 1 : 0);
              const inputTokens = Math.ceil(inputValue.length / 4);
              const mentionTokens = mentions.reduce((s: number, m: any) => s + (m.insertText?.length || 200), 0);
              const selTokens = hasSelection && isContextEnabled ? 300 : 0;
              const estimatedTokens = inputTokens + mentionTokens + selTokens + 200;
              const pct = Math.min(Math.round(estimatedTokens / 32768 * 100), 100);

              if (mentionCount > 0 || inputValue.length > 20) {
                return (
                  <span className="flex items-center gap-1.5 text-[var(--vscode-descriptionForeground)]">
                    {mentionCount > 0 && <span className="text-[var(--vscode-textLink-foreground)]">{mentionCount} {mentionCount === 1 ? 'Datei' : 'Dateien'}</span>}
                    {mentionCount > 0 && <span className="opacity-40">·</span>}
                    <span>~{estimatedTokens < 1000 ? estimatedTokens : `${(estimatedTokens / 1000).toFixed(1)}K`} Tokens</span>
                    <span className="opacity-40">·</span>
                    <span className={pct > 80 ? 'text-[var(--vscode-charts-orange)]' : ''}>{pct}% Kontext</span>
                  </span>
                );
              }
              return hasSelection && isContextEnabled ? (
                <span className="flex items-center gap-1 text-[var(--vscode-textLink-foreground)]">
                  <Sparkles size={12} /> Selection included
                </span>
              ) : null;
            })()}
          </div>
          <div>
            {inputValue.toLowerCase().startsWith('remember ') && (
              <span className="text-[var(--vscode-charts-purple)]">💡 This will be saved as a memory</span>
            )}
            {inputValue.toLowerCase().startsWith('forget ') && (
              <span className="text-[var(--vscode-charts-orange)]">🗑️ This will remove matching memories</span>
            )}
            {!inputValue.toLowerCase().startsWith('remember ') && !inputValue.toLowerCase().startsWith('forget ') && <>
            <kbd className="px-1 py-0.5 bg-[var(--vscode-badge-background)] rounded text-[10px]">@</kbd> mention</>}
            {' · '}<kbd className="px-1 py-0.5 bg-[var(--vscode-badge-background)] rounded text-[10px]">Enter</kbd> send
            {' · '}<kbd className="px-1 py-0.5 bg-[var(--vscode-badge-background)] rounded text-[10px]">Shift+Enter</kbd> new line
            {isStreaming && <>{' · '}<kbd className="px-1 py-0.5 bg-[var(--vscode-badge-background)] rounded text-[10px]">Esc</kbd> stop</>}
          </div>
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
