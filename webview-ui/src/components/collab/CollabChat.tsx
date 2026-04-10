/**
 * CollabChat.tsx
 * Phase 19B Step 19.5 — Collaborative chat view with participant colors and AI responses
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface CollabChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  participantColor: string;
  type: 'text' | 'code' | 'ai_request' | 'ai_response' | 'system' | 'file_share';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface CollabChatProps {
  messages: CollabChatMessage[];
  currentUserId: string;
  canSendMessages: boolean;
  canRequestAI: boolean;
  onSendMessage: (content: string, type: 'text' | 'code') => void;
  onAskAI: (question: string) => void;
  onApplyCode: (code: string) => void;
  onShareFile: () => void;
}

const CollabChat: React.FC<CollabChatProps> = ({
  messages,
  currentUserId,
  canSendMessages,
  canRequestAI,
  onSendMessage,
  onAskAI,
  onApplyCode,
  onShareFile,
}) => {
  const [input, setInput] = useState('');
  const [isCodeMode, setIsCodeMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('@ai ') || trimmed.startsWith('/ai ')) {
      onAskAI(trimmed.slice(4));
    } else {
      onSendMessage(trimmed, isCodeMode ? 'code' : 'text');
    }
    setInput('');
    setIsCodeMode(false);
  }, [input, isCodeMode, onSendMessage, onAskAI]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const renderMessage = (msg: CollabChatMessage) => {
    const isOwn = msg.participantId === currentUserId;
    const isSystem = msg.type === 'system';
    const isAI = msg.type === 'ai_request' || msg.type === 'ai_response';

    if (isSystem) {
      return (
        <div key={msg.id} className="collab-msg collab-msg-system" role="status" aria-live="polite">
          <span className="codicon codicon-info" aria-hidden="true" />
          <span>{msg.content}</span>
          <span className="collab-msg-time">{formatTime(msg.timestamp)}</span>
        </div>
      );
    }

    return (
      <div
        key={msg.id}
        className={`collab-msg ${isOwn ? 'collab-msg-own' : ''} ${isAI ? 'collab-msg-ai' : ''}`}
        role="article"
        aria-label={`${msg.participantName}: ${msg.type === 'code' ? 'code block' : msg.type === 'ai_response' ? 'AI response' : 'message'}`}
      >
        <div className="collab-msg-header">
          <span
            className="collab-msg-dot"
            style={{ backgroundColor: isAI ? '#7c3aed' : msg.participantColor }}
            aria-hidden="true"
          />
          <span className="collab-msg-name" style={{ color: isAI ? '#7c3aed' : msg.participantColor }}>
            {msg.type === 'ai_response' ? (
              <><span className="codicon codicon-hubot" aria-hidden="true" /> INA-7 Pro</>
            ) : msg.type === 'ai_request' ? (
              <>{msg.participantName} <span className="collab-badge">→ AI</span></>
            ) : (
              msg.participantName
            )}
          </span>
          <span className="collab-msg-time">{formatTime(msg.timestamp)}</span>
        </div>

        <div className="collab-msg-body">
          {(msg.type === 'code' || msg.type === 'file_share') ? (
            <div className="collab-code-block">
              {msg.metadata?.fileName && (
                <div className="collab-code-filename">
                  <span className="codicon codicon-file" aria-hidden="true" /> {msg.metadata.fileName}
                </div>
              )}
              <pre><code className={msg.metadata?.language ? `language-${msg.metadata.language}` : ''}>
                {msg.content}
              </code></pre>
              <button
                className="collab-btn collab-btn-sm collab-btn-apply"
                onClick={() => onApplyCode(msg.content)}
                title="Apply this code"
                aria-label="Apply code to editor"
              >
                <span className="codicon codicon-check" aria-hidden="true" /> Apply
              </button>
            </div>
          ) : msg.type === 'ai_response' ? (
            <div className="collab-ai-response">
              <div className="collab-msg-text">{msg.content}</div>
            </div>
          ) : (
            <div className="collab-msg-text">{msg.content}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="collab-chat" role="region" aria-label="Team chat">
      <div className="collab-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && (
          <div className="collab-empty" role="status">
            <span className="codicon codicon-comment-discussion" aria-hidden="true" />
            <p>No messages yet. Start collaborating!</p>
            <p className="collab-hint">Type <code>@ai</code> to ask INA-7 Pro — everyone sees the answer.</p>
          </div>
        )}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {canSendMessages && (
        <div className="collab-chat-input" role="form" aria-label="Send message">
          <div className="collab-input-row">
            <button
              className={`collab-btn collab-btn-icon ${isCodeMode ? 'active' : ''}`}
              onClick={() => setIsCodeMode(!isCodeMode)}
              title={isCodeMode ? 'Switch to text' : 'Switch to code'}
              aria-label={isCodeMode ? 'Switch to text mode' : 'Switch to code mode'}
              aria-pressed={isCodeMode}
            >
              <span className="codicon codicon-code" aria-hidden="true" />
            </button>
            <textarea
              ref={inputRef}
              className={`collab-textarea ${isCodeMode ? 'collab-textarea-code' : ''}`}
              placeholder={isCodeMode ? 'Paste code to share...' : 'Message team... (@ai to ask INA-7 Pro)'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={isCodeMode ? 4 : 1}
              aria-label={isCodeMode ? 'Code input' : 'Message input'}
            />
            <button
              className="collab-btn collab-btn-icon"
              onClick={onShareFile}
              title="Share current file"
              aria-label="Share current file with team"
            >
              <span className="codicon codicon-file-add" aria-hidden="true" />
            </button>
            <button
              className="collab-btn collab-btn-primary collab-btn-send"
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <span className="codicon codicon-send" aria-hidden="true" />
            </button>
          </div>
          {canRequestAI && (
            <div className="collab-input-hint" aria-hidden="true">
              <span className="codicon codicon-hubot" /> <code>@ai</code> — shared AI assistant
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CollabChat;
