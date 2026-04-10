/**
 * MCP service barrel — Phase 16.2
 */

export { MCPClient } from './MCPClient';
export { MCPDiscovery } from './MCPDiscovery';
export { MCPToolExecutor } from './MCPToolExecutor';
export { registerBuiltinMCPServers } from './MCPBuiltinServers';
export {
  MCPCapability,
  BUILTIN_MCP_SERVERS,
  DEFAULT_DISCOVERY_CONFIG,
  MCP_PROTOCOL_VERSION,
  MCP_REQUEST_TIMEOUT_MS,
} from './MCPTypes';
export type {
  MCPServerConfig,
  MCPServerStatus,
  MCPServerStatusType,
  MCPTransportType,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolCall,
  MCPToolResult,
  MCPDiscoveryConfig,
  JsonRpcRequest,
  JsonRpcResponse,
} from './MCPTypes';
