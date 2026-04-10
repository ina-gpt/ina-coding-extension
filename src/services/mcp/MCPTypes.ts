/**
 * MCPTypes.ts
 * Phase 16.2 — Model Context Protocol Client
 *
 * Type definitions for MCP server integration. Implements the
 * Model Context Protocol spec (2024-11-05) over JSON-RPC 2.0.
 */

// ============ Capability ============

export enum MCPCapability {
  TOOLS = 'tools',
  RESOURCES = 'resources',
  PROMPTS = 'prompts',
  SAMPLING = 'sampling',
}

// ============ Server Config ============

export type MCPTransportType = 'stdio' | 'sse';

export interface MCPServerConfig {
  name: string;
  displayName: string;
  description?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  transportType: MCPTransportType;
  url: string | null;
  enabled: boolean;
  autoStart: boolean;
  capabilities: MCPCapability[];
  /** True for INA's built-in servers (no spawn needed) */
  builtin?: boolean;
}

// ============ Tool / Resource ============

export interface MCPTool {
  name: string;
  description: string;
  /** JSON Schema describing the tool's input arguments */
  inputSchema: any;
  serverName: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  serverName: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  serverName: string;
}

// ============ Tool Calls ============

export interface MCPToolCall {
  toolName: string;
  serverName: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  toolName: string;
  serverName: string;
  result: any;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
}

// ============ Server Status ============

export type MCPServerStatusType = 'connected' | 'disconnected' | 'error' | 'starting';

export interface MCPServerStatus {
  name: string;
  displayName: string;
  status: MCPServerStatusType;
  toolCount: number;
  resourceCount: number;
  lastError: string | null;
  pid: number | null;
  builtin: boolean;
}

// ============ Discovery ============

export interface MCPDiscoveryConfig {
  workspaceFile: string;
  globalFile: string;
  autoDiscover: boolean;
}

export const DEFAULT_DISCOVERY_CONFIG: MCPDiscoveryConfig = {
  workspaceFile: '.mcp.json',
  globalFile: '~/.mcp/config.json',
  autoDiscover: true,
};

// ============ JSON-RPC envelope ============

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// ============ Built-in INA Servers ============

export const BUILTIN_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'ina-filesystem',
    displayName: 'INA Filesystem',
    description: 'Read/write files in workspace',
    command: '',
    args: [],
    env: {},
    transportType: 'stdio',
    url: null,
    enabled: true,
    autoStart: true,
    capabilities: [MCPCapability.TOOLS, MCPCapability.RESOURCES],
    builtin: true,
  },
  {
    name: 'ina-search',
    displayName: 'INA Search',
    description: 'Semantic code search',
    command: '',
    args: [],
    env: {},
    transportType: 'stdio',
    url: null,
    enabled: true,
    autoStart: true,
    capabilities: [MCPCapability.TOOLS],
    builtin: true,
  },
  {
    name: 'ina-git',
    displayName: 'INA Git',
    description: 'Git operations',
    command: '',
    args: [],
    env: {},
    transportType: 'stdio',
    url: null,
    enabled: true,
    autoStart: true,
    capabilities: [MCPCapability.TOOLS],
    builtin: true,
  },
  {
    name: 'ina-memory',
    displayName: 'INA Memory',
    description: 'AI memory system',
    command: '',
    args: [],
    env: {},
    transportType: 'stdio',
    url: null,
    enabled: true,
    autoStart: true,
    capabilities: [MCPCapability.TOOLS],
    builtin: true,
  },
];

// ============ Helper ============

/** Maximum time (ms) to wait for a JSON-RPC response */
export const MCP_REQUEST_TIMEOUT_MS = 30_000;

/** Maximum time (ms) to wait for the initialize handshake */
export const MCP_INITIALIZE_TIMEOUT_MS = 15_000;

export const MCP_PROTOCOL_VERSION = '2024-11-05';
