import React, { useMemo, useState } from 'react';
import {
  X,
  Plus,
  Wrench,
  Server,
  Play,
  Trash2,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type { MCPServerStatus, MCPTool } from '@/types';

interface MCPPanelProps {
  servers: MCPServerStatus[];
  tools: MCPTool[];
  onConnect: (config: any) => void;
  onDisconnect: (serverName: string) => void;
  onAddServer: (config: any) => void;
  onRemoveServer: (serverName: string) => void;
  onCallTool: (serverName: string, toolName: string, args: Record<string, any>) => void;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-500',
  error: 'bg-red-500',
  starting: 'bg-amber-500 animate-pulse',
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
  starting: 'Starting',
};

interface ToolCallLogEntry {
  id: string;
  serverName: string;
  toolName: string;
  args: Record<string, any>;
  result: string;
  isError: boolean;
  durationMs: number;
  timestamp: number;
}

export const MCPPanel: React.FC<MCPPanelProps> = ({
  servers,
  tools,
  onConnect,
  onDisconnect,
  onAddServer,
  onRemoveServer,
  onCallTool,
  onClose,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('');
  const [newServerArgs, setNewServerArgs] = useState('');
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [testingTool, setTestingTool] = useState<MCPTool | null>(null);
  const [testArgsText, setTestArgsText] = useState('{}');
  const [callLog] = useState<ToolCallLogEntry[]>([]);

  const toolsByServer = useMemo(() => {
    const groups: Record<string, MCPTool[]> = {};
    for (const t of tools) {
      if (!groups[t.serverName]) groups[t.serverName] = [];
      groups[t.serverName].push(t);
    }
    return groups;
  }, [tools]);

  const toggleServer = (name: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAddServer = () => {
    if (!newServerName.trim() || !newServerCommand.trim()) return;
    onAddServer({
      name: newServerName.trim(),
      displayName: newServerName.trim(),
      command: newServerCommand.trim(),
      args: newServerArgs
        .trim()
        .split(/\s+/)
        .filter(Boolean),
      env: {},
      transportType: 'stdio',
      enabled: true,
      autoStart: true,
    });
    setNewServerName('');
    setNewServerCommand('');
    setNewServerArgs('');
    setShowAddForm(false);
  };

  const handleTestTool = () => {
    if (!testingTool) return;
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(testArgsText);
    } catch {
      alert('Invalid JSON for arguments');
      return;
    }
    onCallTool(testingTool.serverName, testingTool.name, args);
    setTestingTool(null);
    setTestArgsText('{}');
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
            <span className="text-sm font-semibold">MCP Servers & Tools</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {servers.filter((s) => s.status === 'connected').length}/{servers.length} connected
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* CONNECTED SERVERS */}
          <section className="px-4 py-3 border-b border-[var(--vscode-panel-border)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[var(--vscode-foreground)]">
                Servers ({servers.length})
              </h3>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                <Plus size={11} />
                Add server
              </button>
            </div>

            <div className="space-y-1">
              {servers.length === 0 && (
                <div className="text-[11px] text-[var(--vscode-descriptionForeground)] py-2">
                  No MCP servers configured
                </div>
              )}
              {servers.map((server) => {
                const expanded = expandedServers.has(server.name);
                const serverTools = toolsByServer[server.name] || [];
                return (
                  <div
                    key={server.name}
                    className="rounded border border-[var(--vscode-panel-border)] overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                      onClick={() => toggleServer(server.name)}
                    >
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          STATUS_COLOR[server.status]
                        )}
                      />
                      <Server size={12} className="text-[var(--vscode-descriptionForeground)]" />
                      <span className="text-xs font-medium flex-1 truncate">
                        {server.displayName}
                        {server.builtin && (
                          <span className="ml-2 text-[9px] bg-purple-500/20 text-purple-400 px-1 rounded">
                            BUILTIN
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                        {server.toolCount} tools
                      </span>
                      <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                        {STATUS_LABEL[server.status]}
                      </span>
                      {server.status === 'connected' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDisconnect(server.name);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onConnect({ name: server.name });
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25"
                        >
                          Connect
                        </button>
                      )}
                      {!server.builtin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveServer(server.name);
                          }}
                          className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                          title="Remove"
                        >
                          <Trash2 size={11} className="text-[var(--vscode-descriptionForeground)]" />
                        </button>
                      )}
                    </div>

                    {/* Tools for this server */}
                    {expanded && serverTools.length > 0 && (
                      <div className="border-t border-[var(--vscode-panel-border)] divide-y divide-[var(--vscode-panel-border)]">
                        {serverTools.map((tool) => (
                          <div
                            key={`${tool.serverName}-${tool.name}`}
                            className="px-3 py-1.5 text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] flex items-center gap-2"
                          >
                            <Wrench size={10} className="text-amber-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-mono">{tool.name}</div>
                              <div className="text-[10px] text-[var(--vscode-descriptionForeground)] truncate">
                                {tool.description}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setTestingTool(tool);
                                setTestArgsText('{}');
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                              title="Test tool"
                            >
                              <Play size={9} />
                              Test
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {expanded && serverTools.length === 0 && (
                      <div className="border-t border-[var(--vscode-panel-border)] px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
                        No tools (server may be disconnected)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add server form */}
            {showAddForm && (
              <div className="mt-3 p-3 border border-[var(--vscode-panel-border)] rounded space-y-2">
                <input
                  type="text"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="Server name (e.g. filesystem)"
                  className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                />
                <input
                  type="text"
                  value={newServerCommand}
                  onChange={(e) => setNewServerCommand(e.target.value)}
                  placeholder="Command (e.g. npx)"
                  className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                />
                <input
                  type="text"
                  value={newServerArgs}
                  onChange={(e) => setNewServerArgs(e.target.value)}
                  placeholder="Args (e.g. -y @modelcontextprotocol/server-filesystem .)"
                  className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                />
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddServer}
                    className="px-2 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* TOOL CALL LOG */}
          {callLog.length > 0 && (
            <section className="px-4 py-3">
              <h3 className="text-xs font-semibold mb-2 flex items-center gap-1">
                <RefreshCw size={11} />
                Recent Tool Calls
              </h3>
              <div className="space-y-1">
                {callLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={clsx(
                      'rounded border px-2 py-1 text-[10px]',
                      entry.isError
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-lineHighlightBackground)]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">
                        {entry.serverName}.{entry.toolName}
                      </span>
                      <span className="text-[var(--vscode-descriptionForeground)]">
                        {entry.durationMs}ms
                      </span>
                    </div>
                    <div className="truncate text-[var(--vscode-descriptionForeground)]">
                      {entry.result}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Test tool dialog */}
        {testingTool && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[400px] p-4">
              <div className="text-sm font-semibold mb-2">
                Test: {testingTool.serverName}.{testingTool.name}
              </div>
              <div className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-2">
                {testingTool.description}
              </div>
              <textarea
                value={testArgsText}
                onChange={(e) => setTestArgsText(e.target.value)}
                rows={6}
                className="w-full font-mono text-[11px] px-2 py-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                placeholder='{"arg": "value"}'
              />
              <div className="flex justify-end gap-1 mt-3">
                <button
                  onClick={() => setTestingTool(null)}
                  className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestTool}
                  className="px-3 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
                >
                  Run
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPPanel;
