/**
 * MCPToolExecutor.ts
 * Phase 16.2 — Wires MCP tools into the agent chat experience
 *
 * Responsibilities:
 *   - Format the tool catalog for prompt injection
 *   - Parse <tool_call> XML tags out of AI responses
 *   - Execute tool calls with optional approval gate
 *   - Format results for chat display
 */

import * as vscode from 'vscode';
import { MCPClient } from './MCPClient';
import { MCPToolCall, MCPToolResult, MCPTool } from './MCPTypes';
import { Logger } from '../../utils/Logger';

interface ApprovalConfig {
  /** Require user approval for any tool call */
  requireApproval: boolean;
  /** Tools whose names match these patterns auto-approve (read-only) */
  autoApprovePatterns: RegExp[];
}

const DEFAULT_APPROVAL: ApprovalConfig = {
  requireApproval: true,
  autoApprovePatterns: [
    /^read_/,
    /^list_/,
    /^get_/,
    /^search_/,
    /^find_/,
    /^query$/,
  ],
};

export class MCPToolExecutor {
  private static instance: MCPToolExecutor;
  private mcpClient: MCPClient;
  private approvalConfig: ApprovalConfig = DEFAULT_APPROVAL;

  private constructor() {
    this.mcpClient = MCPClient.getInstance();
  }

  static getInstance(): MCPToolExecutor {
    if (!MCPToolExecutor.instance) {
      MCPToolExecutor.instance = new MCPToolExecutor();
    }
    return MCPToolExecutor.instance;
  }

  setApprovalConfig(cfg: Partial<ApprovalConfig>): void {
    this.approvalConfig = { ...this.approvalConfig, ...cfg };
  }

  /**
   * Execute a single tool call. If approval is required and the tool is
   * not auto-approve, prompts the user via VS Code modal.
   */
  async executeToolCall(toolCall: MCPToolCall, _context?: any): Promise<MCPToolResult> {
    // Validate
    const tool = this.findTool(toolCall.toolName, toolCall.serverName);
    if (!tool) {
      return {
        toolName: toolCall.toolName,
        serverName: toolCall.serverName,
        result: null,
        isError: true,
        errorMessage: `Tool not found: ${toolCall.toolName}`,
        durationMs: 0,
      };
    }

    // Approval gate
    if (this.approvalConfig.requireApproval && !this.isAutoApproveTool(tool.name)) {
      const approved = await this.promptApproval(tool, toolCall.arguments);
      if (!approved) {
        return {
          toolName: toolCall.toolName,
          serverName: toolCall.serverName,
          result: null,
          isError: true,
          errorMessage: 'Tool call rejected by user',
          durationMs: 0,
        };
      }
    }

    // Execute via MCPClient
    return this.mcpClient.callTool(tool.serverName, tool.name, toolCall.arguments);
  }

  /**
   * Format the tool catalog for injection into the AI system prompt.
   */
  getToolsForPrompt(): string {
    const tools = this.mcpClient.listTools();
    if (tools.length === 0) return '';

    const lines = ['Available MCP tools (call them in your response with <tool_call> tags):', ''];
    for (const t of tools) {
      const argsHint = this.summarizeSchema(t.inputSchema);
      lines.push(`- ${t.serverName}.${t.name}${argsHint ? `(${argsHint})` : ''}: ${t.description}`);
    }
    lines.push('');
    lines.push('To call a tool, respond with:');
    lines.push('<tool_call name="serverName.toolName">{"arg": "value"}</tool_call>');
    lines.push('You may call multiple tools. The system will execute them and return results.');
    return lines.join('\n');
  }

  /**
   * Parse the first <tool_call> tag in an AI response. Returns null if absent.
   */
  parseToolCallFromResponse(response: string): MCPToolCall | null {
    const match = response.match(/<tool_call\s+name="([^"]+)"\s*>([\s\S]*?)<\/tool_call>/);
    if (!match) return null;
    const fullName = match[1];
    const body = match[2].trim();

    const dotIdx = fullName.indexOf('.');
    if (dotIdx < 0) {
      Logger.warn(`[MCP] Malformed tool name (expected server.tool): ${fullName}`);
      return null;
    }
    const serverName = fullName.substring(0, dotIdx);
    const toolName = fullName.substring(dotIdx + 1);

    let args: Record<string, any> = {};
    try {
      args = body ? JSON.parse(body) : {};
    } catch (e) {
      Logger.warn(`[MCP] Failed to parse tool arguments JSON: ${String(e)}`);
      return null;
    }

    return { serverName, toolName, arguments: args };
  }

  /**
   * Parse all tool calls in a response (multiple calls supported).
   */
  parseAllToolCalls(response: string): MCPToolCall[] {
    const calls: MCPToolCall[] = [];
    const re = /<tool_call\s+name="([^"]+)"\s*>([\s\S]*?)<\/tool_call>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(response)) !== null) {
      const fullName = match[1];
      const body = match[2].trim();
      const dotIdx = fullName.indexOf('.');
      if (dotIdx < 0) continue;
      const serverName = fullName.substring(0, dotIdx);
      const toolName = fullName.substring(dotIdx + 1);
      try {
        const args = body ? JSON.parse(body) : {};
        calls.push({ serverName, toolName, arguments: args });
      } catch {
        /* skip malformed */
      }
    }
    return calls;
  }

  /**
   * Execute the tool call and format both the raw result and a chat-friendly
   * markdown rendering of "what was called → what came back".
   */
  async handleToolCallInChat(
    toolCall: MCPToolCall
  ): Promise<{ result: MCPToolResult; formattedForChat: string }> {
    const result = await this.executeToolCall(toolCall);
    const formattedForChat = this.formatResultForChat(toolCall, result);
    return { result, formattedForChat };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private findTool(toolName: string, serverName: string): MCPTool | null {
    const tools = this.mcpClient.listTools();
    return (
      tools.find((t) => t.serverName === serverName && t.name === toolName) ??
      tools.find((t) => t.name === toolName) ??
      null
    );
  }

  private isAutoApproveTool(name: string): boolean {
    return this.approvalConfig.autoApprovePatterns.some((p) => p.test(name));
  }

  private async promptApproval(tool: MCPTool, args: Record<string, any>): Promise<boolean> {
    const detail = JSON.stringify(args, null, 2).substring(0, 500);
    const choice = await vscode.window.showWarningMessage(
      `MCP tool call requested: ${tool.serverName}.${tool.name}`,
      { modal: true, detail },
      'Allow',
      'Deny'
    );
    return choice === 'Allow';
  }

  private summarizeSchema(schema: any): string {
    if (!schema || typeof schema !== 'object') return '';
    const props = schema.properties as Record<string, any> | undefined;
    if (!props) return '';
    const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
    const parts: string[] = [];
    for (const [name] of Object.entries(props)) {
      parts.push(required.has(name) ? name : `${name}?`);
    }
    return parts.join(', ');
  }

  private formatResultForChat(call: MCPToolCall, result: MCPToolResult): string {
    const argsStr =
      Object.keys(call.arguments).length > 0
        ? JSON.stringify(call.arguments).substring(0, 200)
        : '';
    const header = `🔧 Called \`${call.serverName}.${call.toolName}\`${argsStr ? `(${argsStr})` : ''}`;

    if (result.isError) {
      return `${header}\n❌ Error: ${result.errorMessage}`;
    }

    let resultText: string;
    if (typeof result.result === 'string') {
      resultText = result.result;
    } else {
      // MCP standard wraps content in { content: [{ type: 'text', text: '...' }] }
      const content = result.result?.content;
      if (Array.isArray(content)) {
        resultText = content
          .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
          .join('\n');
      } else {
        resultText = JSON.stringify(result.result, null, 2);
      }
    }
    // Truncate to 50 lines
    const lines = resultText.split('\n');
    if (lines.length > 50) {
      resultText = lines.slice(0, 50).join('\n') + `\n... (${lines.length - 50} more lines)`;
    }
    return `${header}\n✅ Result (${result.durationMs}ms):\n\`\`\`\n${resultText}\n\`\`\``;
  }
}
