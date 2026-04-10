/**
 * MCPDiscovery.ts
 * Phase 16.2 — Discovers MCP server configurations
 *
 * Resolves MCP servers from:
 *   1. Workspace `.mcp.json` (highest precedence)
 *   2. Global `~/.mcp/config.json` or `~/.config/mcp/config.json`
 *   3. Built-in INA servers
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  MCPServerConfig,
  MCPCapability,
  BUILTIN_MCP_SERVERS,
  DEFAULT_DISCOVERY_CONFIG,
} from './MCPTypes';
import { Logger } from '../../utils/Logger';

interface ConfigFileFormat {
  mcpServers?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      disabled?: boolean;
      transportType?: 'stdio' | 'sse';
      url?: string;
    }
  >;
}

export class MCPDiscovery {
  private static instance: MCPDiscovery;

  private constructor() {}

  static getInstance(): MCPDiscovery {
    if (!MCPDiscovery.instance) {
      MCPDiscovery.instance = new MCPDiscovery();
    }
    return MCPDiscovery.instance;
  }

  /**
   * Discover all configured MCP servers, merging workspace + global + built-in.
   */
  async discoverServers(workspaceRoot: string | null): Promise<MCPServerConfig[]> {
    const merged = new Map<string, MCPServerConfig>();

    // Built-ins first (so they can be overridden by user config)
    for (const builtin of BUILTIN_MCP_SERVERS) {
      merged.set(builtin.name, builtin);
    }

    // Global config
    const globalPaths = [
      path.join(os.homedir(), '.mcp', 'config.json'),
      path.join(os.homedir(), '.config', 'mcp', 'config.json'),
    ];
    for (const p of globalPaths) {
      const configs = this.parseConfigFile(p);
      for (const c of configs) merged.set(c.name, c);
    }

    // Workspace config (highest precedence)
    if (workspaceRoot) {
      const wsCandidates = [
        path.join(workspaceRoot, DEFAULT_DISCOVERY_CONFIG.workspaceFile),
        path.join(workspaceRoot, '.mcp', 'config.json'),
      ];
      for (const p of wsCandidates) {
        const configs = this.parseConfigFile(p);
        for (const c of configs) merged.set(c.name, c);
      }
    }

    return [...merged.values()];
  }

  /**
   * Parse a single .mcp.json config file. Returns [] on missing/invalid.
   */
  parseConfigFile(filePath: string): MCPServerConfig[] {
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as ConfigFileFormat;
      const out: MCPServerConfig[] = [];

      const servers = parsed.mcpServers ?? {};
      for (const [name, def] of Object.entries(servers)) {
        out.push({
          name,
          displayName: name,
          command: def.command ?? '',
          args: def.args ?? [],
          env: def.env ?? {},
          transportType: def.transportType ?? 'stdio',
          url: def.url ?? null,
          enabled: !def.disabled,
          autoStart: !def.disabled,
          capabilities: [MCPCapability.TOOLS, MCPCapability.RESOURCES],
        });
      }
      Logger.info(`[MCP] Loaded ${out.length} servers from ${filePath}`);
      return out;
    } catch (e) {
      Logger.warn(`[MCP] Failed to parse ${filePath}: ${String(e)}`);
      return [];
    }
  }

  /**
   * Watch the workspace .mcp.json for changes; the callback receives the
   * fresh list of merged configs whenever it fires.
   */
  watchConfigChanges(
    workspaceRoot: string,
    callback: (configs: MCPServerConfig[]) => void
  ): vscode.Disposable {
    const pattern = new vscode.RelativePattern(workspaceRoot, '.mcp.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handler = async () => {
      const configs = await this.discoverServers(workspaceRoot);
      callback(configs);
    };
    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
    watcher.onDidDelete(handler);
    return watcher;
  }

  /**
   * Curated list of popular MCP servers users may want to install.
   */
  getPopularServers(): Array<{ name: string; package: string; description: string }> {
    return [
      {
        name: 'filesystem',
        package: '@modelcontextprotocol/server-filesystem',
        description: 'Read/write files on the local filesystem',
      },
      {
        name: 'postgres',
        package: '@modelcontextprotocol/server-postgres',
        description: 'Query and inspect PostgreSQL databases',
      },
      {
        name: 'sqlite',
        package: '@modelcontextprotocol/server-sqlite',
        description: 'Query SQLite databases',
      },
      {
        name: 'github',
        package: '@modelcontextprotocol/server-github',
        description: 'Interact with the GitHub API (issues, PRs, repos)',
      },
      {
        name: 'gitlab',
        package: '@modelcontextprotocol/server-gitlab',
        description: 'Interact with GitLab',
      },
      {
        name: 'slack',
        package: '@modelcontextprotocol/server-slack',
        description: 'Read/post to Slack channels',
      },
      {
        name: 'brave-search',
        package: '@modelcontextprotocol/server-brave-search',
        description: 'Web search via Brave Search API',
      },
      {
        name: 'puppeteer',
        package: '@modelcontextprotocol/server-puppeteer',
        description: 'Browser automation',
      },
      {
        name: 'fetch',
        package: '@modelcontextprotocol/server-fetch',
        description: 'Fetch and convert web pages',
      },
      {
        name: 'memory',
        package: '@modelcontextprotocol/server-memory',
        description: 'Knowledge graph–based persistent memory',
      },
    ];
  }
}
