import { CommandSecurityLevel } from './TerminalTypes';
import { Logger } from '../../../utils/Logger';
import { SensitiveFileDetector } from '../../codesec/SensitiveFileDetector';

const SAFE_COMMANDS = new Set([
  'npm install', 'npm ci', 'npm test', 'npm run test', 'npm run build', 'npm run lint',
  'npm run format', 'npm run dev', 'npm run start', 'npm --version', 'npm ls',
  'npx tsc', 'npx eslint', 'npx prettier', 'npx jest', 'npx vitest', 'npx mocha',
  'yarn install', 'yarn test', 'yarn build', 'yarn lint',
  'pnpm install', 'pnpm test', 'pnpm build', 'pnpm lint',
  'node --version', 'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha',
  'git status', 'git diff', 'git log', 'git branch', 'git stash',
  'ls', 'pwd', 'echo', 'cat', 'find', 'grep', 'wc', 'head', 'tail',
  'mkdir', 'mkdir -p',
]);

const SAFE_PREFIXES = [
  'npm run ', 'npx ', 'yarn ', 'pnpm ', 'node ', 'tsc ', 'eslint ', 'prettier ',
  'jest ', 'vitest ', 'mocha ', 'playwright ', 'cypress ',
  'git status', 'git diff', 'git log', 'git branch', 'git stash', 'git add',
  'mkdir ', 'ls ', 'cat ', 'echo ', 'find ', 'grep ', 'head ', 'tail ', 'wc ',
];

const REVIEW_PREFIXES = [
  'npm publish', 'npm link', 'npm uninstall', 'npm pack',
  'git commit', 'git push', 'git pull', 'git merge', 'git rebase', 'git checkout', 'git reset',
  'cp ', 'mv ',
];

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\b(?!.*(?:node_modules|\.next|dist|build|coverage|\.cache|tmp))/,
  /\bsudo\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bchgrp\b/,
  /\bcurl\b.*\|\s*(?:bash|sh|zsh)/,
  /\bwget\b.*\|\s*(?:bash|sh|zsh)/,
  /\beval\b/,
  /\bkill\b/,
  /\bkillall\b/,
  /\bpkill\b/,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+[/~]/,
  /\brm\s+-rf\s+\/\*/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bfdisk\b/,
  /:\(\)\s*\{.*\|.*&\s*\}\s*;/,  // fork bomb
  /\/dev\/sda/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\binit\s+0\b/,
];

// Safe rm targets (cleaning build artifacts)
const SAFE_RM_TARGETS = ['node_modules', '.next', 'dist', 'build', 'coverage', '.cache', 'tmp', '.turbo', '.parcel-cache'];

export class CommandSecurityValidator {
  private static instance: CommandSecurityValidator;

  static getInstance(): CommandSecurityValidator {
    if (!CommandSecurityValidator.instance) {
      CommandSecurityValidator.instance = new CommandSecurityValidator();
    }
    return CommandSecurityValidator.instance;
  }

  validateCommand(command: string, config?: Record<string, any>): { level: CommandSecurityLevel; reason: string | null; sanitizedCommand: string | null } {
    const trimmed = command.trim();

    // Check BLOCKED first
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { level: CommandSecurityLevel.BLOCKED, reason: `Blocked: matches dangerous pattern`, sanitizedCommand: null };
      }
    }

    // Parse command components for thorough check
    const components = this.parseCommandComponents(trimmed);

    // Check each component in pipes/chains
    for (const comp of [components.base, ...components.pipes, ...components.chains]) {
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(comp)) {
          return { level: CommandSecurityLevel.BLOCKED, reason: `Blocked component: "${comp}"`, sanitizedCommand: null };
        }
      }
    }

    // Check for rm with safe targets
    if (/\brm\b/.test(trimmed)) {
      const isCleanCommand = SAFE_RM_TARGETS.some(target => trimmed.includes(target));
      if (isCleanCommand) {
        return { level: CommandSecurityLevel.NEEDS_REVIEW, reason: 'rm command targeting build artifacts', sanitizedCommand: trimmed };
      }
    }

    // Check DANGEROUS
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { level: CommandSecurityLevel.DANGEROUS, reason: `Dangerous: matches pattern`, sanitizedCommand: null };
      }
    }

    // Check if command references sensitive files
    const detector = SensitiveFileDetector.getInstance();
    const fileRefs = trimmed.match(/\S+\.\w+/g) || [];
    for (const ref of fileRefs) {
      if (detector.isSensitiveFile(ref)) {
        return { level: CommandSecurityLevel.NEEDS_REVIEW, reason: `Command references sensitive file: ${ref}`, sanitizedCommand: trimmed };
      }
    }

    // Check SAFE (exact match)
    if (SAFE_COMMANDS.has(trimmed)) {
      return { level: CommandSecurityLevel.SAFE, reason: null, sanitizedCommand: trimmed };
    }

    // Check SAFE prefixes
    for (const prefix of SAFE_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        return { level: CommandSecurityLevel.SAFE, reason: null, sanitizedCommand: trimmed };
      }
    }

    // Check REVIEW prefixes
    for (const prefix of REVIEW_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        return { level: CommandSecurityLevel.NEEDS_REVIEW, reason: `Command "${prefix.trim()}" requires review`, sanitizedCommand: trimmed };
      }
    }

    // Default: needs review for unknown commands
    return { level: CommandSecurityLevel.NEEDS_REVIEW, reason: 'Unknown command requires review', sanitizedCommand: trimmed };
  }

  parseCommandComponents(command: string): { base: string; args: string[]; pipes: string[]; redirects: string[]; chains: string[] } {
    const chains = command.split(/\s*(?:&&|\|\||;)\s*/).map(s => s.trim()).filter(Boolean);
    const base = chains[0] || command;
    const parts = base.split(/\s+/);

    const pipes = command.split(/\s*\|\s*/).slice(1).map(s => s.trim());
    const redirects = (command.match(/(?:>>?|2>>?)\s*\S+/g) || []).map(s => s.trim());

    return { base: parts[0] || '', args: parts.slice(1), pipes, redirects, chains: chains.slice(1) };
  }

  sanitizeCommand(command: string): string {
    // Strip ANSI escape sequences
    let sanitized = command.replace(/\x1b\[[0-9;]*m/g, '');
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    return sanitized;
  }

  isWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
    const path = require('path');
    const resolved = path.resolve(workspaceRoot, filePath);
    return resolved.startsWith(workspaceRoot);
  }
}
