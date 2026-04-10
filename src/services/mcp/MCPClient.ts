/**
 * MCPClient.ts
 * Phase 16.2 — Model Context Protocol Client
 *
 * Singleton that manages connections to MCP servers via JSON-RPC 2.0.
 * Supports stdio transport (most common) and SSE transport.
 *
 * Built-in INA servers (`builtin: true`) are NOT spawned — they delegate
 * to MCPBuiltinServers which is also wired into this client's tool/resource
 * registry by extension.ts at activation time.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import {
  MCPServerConfig,
  MCPServerStatus,
  MCPServerStatusType,
  MCPTool,
  MCPResource,
  MCPToolResult,
  JsonRpcRequest,
  JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
  MCP_REQUEST_TIMEOUT_MS,
  MCP_INITIALIZE_TIMEOUT_MS,
} from './MCPTypes';
import { Logger } from '../../utils/Logger';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
  method: string;
}

class MCPServerConnection {
  process: ChildProcess | null = null;
  config: MCPServerConfig;
  status: MCPServerStatus;
  requestId = 0;
  pendingRequests = new Map<number, PendingRequest>();
  /** Buffer for incomplete stdout chunks (NDJSON) */
  buffer = '';
  /**
   * For built-in servers: a synchronous request handler
   * mapped {method → (params) => Promise<any>}.
   */
  builtinHandler: ((method: string, params: any) => Promise<any>) | null = null;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.status = {
      name: config.name,
      displayName: config.displayName,
      status: 'disconnected',
      toolCount: 0,
      resourceCount: 0,
      lastError: null,
      pid: null,
      builtin: !!config.builtin,
    };
  }
}

export class MCPClient {
  private static instance: MCPClient;

  private servers = new Map<string, MCPServerConnection>();
  private tools = new Map<string, MCPTool>();
  private resources = new Map<string, MCPResource>();

  // ============ Events ============
  private readonly _onServerStatusChanged = new vscode.EventEmitter<MCPServerStatus>();
  readonly onServerStatusChanged = this._onServerStatusChanged.event;

  private readonly _onToolsChanged = new vscode.EventEmitter<MCPTool[]>();
  readonly onToolsChanged = this._onToolsChanged.event;

  private constructor() {}

  static getInstance(): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient();
    }
    return MCPClient.instance;
  }

  // ============================================================
  // Connection lifecycle
  // ============================================================

  async connect(config: MCPServerConfig): Promise<MCPServerStatus> {
    if (this.servers.has(config.name)) {
      Logger.warn(`[MCP] Server already connected: ${config.name}`);
      return this.servers.get(config.name)!.status;
    }

    const conn = new MCPServerConnection(config);
    this.servers.set(config.name, conn);
    this.setStatus(conn, 'starting');

    try {
      if (config.builtin) {
        // Builtin servers are registered separately via registerBuiltinServer().
        // If we land here without a handler, error out.
        if (!conn.builtinHandler) {
          throw new Error(`Built-in server has no handler: ${config.name}`);
        }
        await this.discoverBuiltinTools(conn);
        this.setStatus(conn, 'connected');
        return conn.status;
      }

      if (config.transportType === 'stdio') {
        await this.connectStdio(conn);
      } else if (config.transportType === 'sse') {
        await this.connectSse(conn);
      } else {
        throw new Error(`Unsupported transport: ${config.transportType}`);
      }

      // Initialize handshake
      await this.sendRequest(conn, 'initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'ina-coding', version: '1.0.0' },
      });
      // Notification: initialized
      this.sendNotification(conn, 'notifications/initialized', {});

      // Discover tools / resources
      await this.discoverToolsAndResources(conn);
      this.setStatus(conn, 'connected');
      return conn.status;
    } catch (err: any) {
      conn.status.lastError = err?.message ?? String(err);
      this.setStatus(conn, 'error');
      Logger.error(`[MCP] Failed to connect ${config.name}:`, err);
      throw err;
    }
  }

  /**
   * Register a built-in server with a synchronous in-process handler.
   * Called by extension.ts at activation for INAFilesystemServer etc.
   */
  registerBuiltinServer(
    config: MCPServerConfig,
    handler: (method: string, params: any) => Promise<any>
  ): void {
    const conn = new MCPServerConnection(config);
    conn.builtinHandler = handler;
    this.servers.set(config.name, conn);
  }

  disconnect(serverName: string): void {
    const conn = this.servers.get(serverName);
    if (!conn) return;

    if (conn.process) {
      try {
        conn.process.kill('SIGTERM');
      } catch (e) {
        Logger.warn(`[MCP] Failed to kill process for ${serverName}: ${String(e)}`);
      }
      conn.process = null;
    }
    // Reject pending requests
    for (const [, pending] of conn.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server disconnected'));
    }
    conn.pendingRequests.clear();

    // Remove tools/resources owned by this server
    for (const [k, v] of [...this.tools]) {
      if (v.serverName === serverName) this.tools.delete(k);
    }
    for (const [k, v] of [...this.resources]) {
      if (v.serverName === serverName) this.resources.delete(k);
    }

    this.setStatus(conn, 'disconnected');
    this.servers.delete(serverName);
    this._onToolsChanged.fire(this.listTools());
  }

  disconnectAll(): void {
    for (const name of [...this.servers.keys()]) {
      this.disconnect(name);
    }
  }

  // ============================================================
  // Tool / resource calls
  // ============================================================

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    const startTime = Date.now();
    const conn = this.servers.get(serverName);
    if (!conn) {
      return {
        toolName,
        serverName,
        result: null,
        isError: true,
        errorMessage: `Server not connected: ${serverName}`,
        durationMs: 0,
      };
    }

    try {
      const result = conn.builtinHandler
        ? await conn.builtinHandler('tools/call', { name: toolName, arguments: args })
        : await this.sendRequest(conn, 'tools/call', { name: toolName, arguments: args });
      return {
        toolName,
        serverName,
        result,
        isError: false,
        errorMessage: null,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        toolName,
        serverName,
        result: null,
        isError: true,
        errorMessage: err?.message ?? String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  async readResource(
    serverName: string,
    uri: string
  ): Promise<{ content: string; mimeType: string }> {
    const conn = this.servers.get(serverName);
    if (!conn) throw new Error(`Server not connected: ${serverName}`);
    const result = conn.builtinHandler
      ? await conn.builtinHandler('resources/read', { uri })
      : await this.sendRequest(conn, 'resources/read', { uri });
    return {
      content: result?.contents?.[0]?.text ?? '',
      mimeType: result?.contents?.[0]?.mimeType ?? 'text/plain',
    };
  }

  // ============================================================
  // Listing
  // ============================================================

  listTools(): MCPTool[] {
    return [...this.tools.values()];
  }

  listResources(): MCPResource[] {
    return [...this.resources.values()];
  }

  getServerStatuses(): MCPServerStatus[] {
    return [...this.servers.values()].map((c) => c.status);
  }

  getServer(name: string): MCPServerStatus | null {
    return this.servers.get(name)?.status ?? null;
  }

  // ============================================================
  // Internal — transport
  // ============================================================

  private async connectStdio(conn: MCPServerConnection): Promise<void> {
    const { command, args, env } = conn.config;
    if (!command) throw new Error(`No command for server ${conn.config.name}`);

    const childEnv = { ...process.env, ...env };
    const child = spawn(command, args, {
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    conn.process = child;
    conn.status.pid = child.pid ?? null;

    child.stdout?.on('data', (data: Buffer) => this.handleStdoutData(conn, data));
    child.stderr?.on('data', (data: Buffer) => {
      Logger.warn(`[MCP:${conn.config.name}] stderr: ${data.toString().trim()}`);
    });
    child.on('error', (err) => {
      Logger.error(`[MCP:${conn.config.name}] process error:`, err);
      conn.status.lastError = err.message;
      this.setStatus(conn, 'error');
    });
    child.on('exit', (code, signal) => {
      Logger.info(`[MCP:${conn.config.name}] exited code=${code} signal=${signal}`);
      conn.process = null;
      this.setStatus(conn, 'disconnected');
    });

    // Wait briefly for process to start producing output
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }

  private async connectSse(_conn: MCPServerConnection): Promise<void> {
    // SSE transport is provider-specific and not all MCP servers support it.
    // Keeping a stub here for forward compatibility.
    throw new Error('SSE transport not yet implemented');
  }

  private handleStdoutData(conn: MCPServerConnection, data: Buffer): void {
    conn.buffer += data.toString('utf8');
    // NDJSON: split by newline
    const lines = conn.buffer.split('\n');
    conn.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed);
        if (typeof message.id === 'number') {
          this.handleResponse(conn, message as JsonRpcResponse);
        } else {
          this.handleNotification(conn, message);
        }
      } catch (e) {
        Logger.warn(`[MCP:${conn.config.name}] failed to parse line: ${trimmed.substring(0, 200)}`);
      }
    }
  }

  private handleResponse(conn: MCPServerConnection, message: JsonRpcResponse): void {
    const pending = conn.pendingRequests.get(message.id);
    if (!pending) {
      Logger.warn(`[MCP:${conn.config.name}] unmatched response id=${message.id}`);
      return;
    }
    clearTimeout(pending.timer);
    conn.pendingRequests.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'MCP error'));
    } else {
      pending.resolve(message.result);
    }
  }

  private handleNotification(conn: MCPServerConnection, message: any): void {
    const method = message.method as string;
    if (method === 'notifications/tools/list_changed') {
      // Refetch tool list
      this.discoverToolsAndResources(conn).catch((e) =>
        Logger.warn(`[MCP] tool refresh failed: ${String(e)}`)
      );
    }
  }

  private async sendRequest(
    conn: MCPServerConnection,
    method: string,
    params: any
  ): Promise<any> {
    if (conn.builtinHandler) {
      return conn.builtinHandler(method, params);
    }
    if (!conn.process || !conn.process.stdin) {
      throw new Error(`Connection not ready: ${conn.config.name}`);
    }

    const id = ++conn.requestId;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const payload = JSON.stringify(req) + '\n';

    return new Promise((resolve, reject) => {
      const timeout = method === 'initialize' ? MCP_INITIALIZE_TIMEOUT_MS : MCP_REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => {
        conn.pendingRequests.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeout);

      conn.pendingRequests.set(id, { resolve, reject, timer, method });
      try {
        conn.process!.stdin!.write(payload, (err) => {
          if (err) {
            clearTimeout(timer);
            conn.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (e) {
        clearTimeout(timer);
        conn.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  private sendNotification(conn: MCPServerConnection, method: string, params: any): void {
    if (conn.builtinHandler || !conn.process || !conn.process.stdin) return;
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    try {
      conn.process.stdin.write(payload);
    } catch (e) {
      Logger.warn(`[MCP] notification write failed: ${String(e)}`);
    }
  }

  // ============================================================
  // Discovery
  // ============================================================

  private async discoverToolsAndResources(conn: MCPServerConnection): Promise<void> {
    try {
      const toolsResult = await this.sendRequest(conn, 'tools/list', {});
      const tools = (toolsResult?.tools ?? []) as Array<{ name: string; description: string; inputSchema: any }>;
      conn.status.toolCount = tools.length;
      for (const t of tools) {
        const tool: MCPTool = {
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? {},
          serverName: conn.config.name,
        };
        this.tools.set(`${conn.config.name}::${t.name}`, tool);
      }
    } catch (e) {
      Logger.warn(`[MCP:${conn.config.name}] tools/list failed: ${String(e)}`);
    }

    try {
      const resourcesResult = await this.sendRequest(conn, 'resources/list', {});
      const resources = (resourcesResult?.resources ?? []) as Array<{
        uri: string;
        name: string;
        description: string;
        mimeType: string;
      }>;
      conn.status.resourceCount = resources.length;
      for (const r of resources) {
        const resource: MCPResource = {
          uri: r.uri,
          name: r.name ?? r.uri,
          description: r.description ?? '',
          mimeType: r.mimeType ?? 'text/plain',
          serverName: conn.config.name,
        };
        this.resources.set(`${conn.config.name}::${r.uri}`, resource);
      }
    } catch (e) {
      Logger.warn(`[MCP:${conn.config.name}] resources/list failed: ${String(e)}`);
    }

    this._onToolsChanged.fire(this.listTools());
  }

  private async discoverBuiltinTools(conn: MCPServerConnection): Promise<void> {
    try {
      const result = await conn.builtinHandler!('tools/list', {});
      const tools = (result?.tools ?? []) as Array<{ name: string; description: string; inputSchema: any }>;
      conn.status.toolCount = tools.length;
      for (const t of tools) {
        this.tools.set(`${conn.config.name}::${t.name}`, {
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? {},
          serverName: conn.config.name,
        });
      }
      this._onToolsChanged.fire(this.listTools());
    } catch (e) {
      Logger.warn(`[MCP] builtin discovery failed for ${conn.config.name}: ${String(e)}`);
    }
  }

  // ============================================================
  // State helpers
  // ============================================================

  private setStatus(conn: MCPServerConnection, status: MCPServerStatusType): void {
    conn.status.status = status;
    this._onServerStatusChanged.fire(conn.status);
  }

  dispose(): void {
    this.disconnectAll();
    this._onServerStatusChanged.dispose();
    this._onToolsChanged.dispose();
  }
}
