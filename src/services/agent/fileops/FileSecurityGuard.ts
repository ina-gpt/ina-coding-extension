import * as path from 'path';
import * as fs from 'fs/promises';
import { FileOpEntry, FileConflict, PROTECTED_PATTERNS, BINARY_EXTENSIONS, MAX_FILE_SIZE, MAX_OPERATIONS_PER_BATCH, MAX_TOTAL_CONTENT_SIZE } from './FileOpsTypes';
import { Logger } from '../../../utils/Logger';
import { SensitiveFileDetector } from '../../codesec/SensitiveFileDetector';
import { CodeSecurityGate } from '../../codesec/CodeSecurityGate';

const SENSITIVE_PATTERNS = [
  /(?:AKIA|ASIA)[0-9A-Z]{16}/,                          // AWS access key
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,       // Private key
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}/i,     // Password assignment
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/i,      // Connection string
  /sk-[A-Za-z0-9]{20,}/,                                 // OpenAI API key
  /ghp_[A-Za-z0-9]{36}/,                                 // GitHub PAT
  /xox[bpors]-[A-Za-z0-9-]+/,                            // Slack token
];

export class FileSecurityGuard {
  private static instance: FileSecurityGuard;

  static getInstance(): FileSecurityGuard {
    if (!FileSecurityGuard.instance) {
      FileSecurityGuard.instance = new FileSecurityGuard();
    }
    return FileSecurityGuard.instance;
  }

  validateOperation(op: FileOpEntry, workspaceRoot: string): { safe: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Null byte injection
    if (op.sourcePath.includes('\0')) {
      errors.push(`Operation ${op.id}: source path contains null bytes`);
    }
    if (op.targetPath && op.targetPath.includes('\0')) {
      errors.push(`Operation ${op.id}: target path contains null bytes`);
    }

    // Path traversal - CRITICAL
    const resolvedSource = path.resolve(workspaceRoot, op.sourcePath);
    if (!resolvedSource.startsWith(workspaceRoot)) {
      errors.push(`Operation ${op.id}: source path "${op.sourcePath}" escapes workspace (path traversal blocked)`);
    }
    if (op.targetPath) {
      const resolvedTarget = path.resolve(workspaceRoot, op.targetPath);
      if (!resolvedTarget.startsWith(workspaceRoot)) {
        errors.push(`Operation ${op.id}: target path "${op.targetPath}" escapes workspace (path traversal blocked)`);
      }
    }

    // Path length (Windows compat)
    if (op.sourcePath.length > 260) {
      errors.push(`Operation ${op.id}: source path exceeds 260 characters`);
    }
    if (op.targetPath && op.targetPath.length > 260) {
      errors.push(`Operation ${op.id}: target path exceeds 260 characters`);
    }

    // Illegal filename characters
    const filename = path.basename(op.sourcePath);
    if (/[<>:"|?*]/.test(filename)) {
      warnings.push(`Operation ${op.id}: filename contains characters that may cause issues on Windows`);
    }

    // Protected path check
    if (this.isProtectedPath(op.sourcePath)) {
      if (op.operation === 'delete' || op.operation === 'edit' || op.operation === 'rename') {
        errors.push(`Operation ${op.id}: "${op.sourcePath}" is a protected path`);
      }
    }

    // File size check for content
    if (op.content && op.content.length > MAX_FILE_SIZE) {
      errors.push(`Operation ${op.id}: content exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Double extension trap
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext);
    if (/\.(exe|bat|cmd|sh|ps1|vbs|msi)$/i.test(stem)) {
      warnings.push(`Operation ${op.id}: suspicious double extension "${filename}"`);
    }

    // Sensitive content detection
    if (op.content) {
      const sensitive = this.detectSensitiveContent(op.content);
      if (sensitive.found) {
        warnings.push(`Operation ${op.id}: content may contain sensitive data (${sensitive.patterns.join(', ')})`);
      }
    }

    // Check if path is a sensitive file via SensitiveFileDetector
    const detector = SensitiveFileDetector.getInstance();
    if (detector.isSensitiveFile(op.sourcePath)) {
      warnings.push(`Operation ${op.id}: "${op.sourcePath}" is a sensitive file (detected by code security)`);
    }
    if (op.targetPath && detector.isSensitiveFile(op.targetPath)) {
      warnings.push(`Operation ${op.id}: "${op.targetPath}" is a sensitive target file (detected by code security)`);
    }

    return { safe: errors.length === 0, errors, warnings };
  }

  validateBatch(ops: FileOpEntry[], workspaceRoot: string): { safe: boolean; errors: string[]; warnings: string[]; conflicts: FileConflict[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: FileConflict[] = [];

    // Batch size
    if (ops.length > MAX_OPERATIONS_PER_BATCH) {
      errors.push(`Batch exceeds maximum ${MAX_OPERATIONS_PER_BATCH} operations`);
    }

    // Validate each operation
    for (const op of ops) {
      const result = this.validateOperation(op, workspaceRoot);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Total content size
    let totalSize = 0;
    for (const op of ops) {
      if (op.content) totalSize += op.content.length;
      if (op.appendContent) totalSize += op.appendContent.length;
      if (op.prependContent) totalSize += op.prependContent.length;
    }
    if (totalSize > MAX_TOTAL_CONTENT_SIZE) {
      errors.push(`Total content size exceeds ${MAX_TOTAL_CONTENT_SIZE / 1024 / 1024}MB limit`);
    }

    // Duplicate targets
    const targets = new Map<string, string>();
    for (const op of ops) {
      const targetKey = op.targetPath || op.sourcePath;
      if (targets.has(targetKey)) {
        conflicts.push({
          operationId: op.id,
          type: 'already-exists',
          description: `Multiple operations target "${targetKey}" (also targeted by ${targets.get(targetKey)})`,
          resolution: null,
        });
      }
      targets.set(targetKey, op.id);
    }

    // Circular renames
    const renames = ops.filter(op => op.operation === 'rename' || op.operation === 'move');
    for (const r1 of renames) {
      for (const r2 of renames) {
        if (r1.id !== r2.id && r1.sourcePath === r2.targetPath && r2.sourcePath === r1.targetPath) {
          conflicts.push({
            operationId: r1.id,
            type: 'circular-rename',
            description: `Circular rename: "${r1.sourcePath}" ↔ "${r1.targetPath}"`,
            resolution: null,
          });
        }
      }
    }

    // Delete then create same path
    for (const del of ops.filter(o => o.operation === 'delete')) {
      for (const create of ops.filter(o => o.operation === 'create')) {
        if (del.sourcePath === create.sourcePath) {
          warnings.push(`Operation sequence deletes then recreates "${del.sourcePath}" — consider EDIT instead`);
        }
      }
    }

    return { safe: errors.length === 0, errors, warnings, conflicts };
  }

  sanitizePath(rawPath: string, workspaceRoot: string): string {
    let p = rawPath.trim().replace(/\\/g, '/');
    // Remove leading ./
    if (p.startsWith('./')) p = p.slice(2);
    // Resolve to absolute then back to relative
    const absolute = path.resolve(workspaceRoot, p);
    if (!absolute.startsWith(workspaceRoot)) {
      throw new Error(`Path "${rawPath}" escapes workspace`);
    }
    return path.relative(workspaceRoot, absolute);
  }

  isProtectedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    for (const pattern of PROTECTED_PATTERNS) {
      if (pattern.includes('**')) {
        const prefix = pattern.replace('/**', '');
        if (normalized.startsWith(prefix + '/') || normalized === prefix) return true;
      } else if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        if (normalized.endsWith(ext)) return true;
      } else if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (normalized.startsWith(prefix)) return true;
      } else {
        if (normalized === pattern || parts.includes(pattern)) return true;
      }
    }
    return false;
  }

  async isBinaryFile(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) return true;

    try {
      const handle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(8192);
        const { bytesRead } = await handle.read(buffer, 0, 8192, 0);
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0) return true;
        }
        return false;
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }

  detectSensitiveContent(content: string): { found: boolean; patterns: string[] } {
    const found: string[] = [];
    const labels = ['AWS Key', 'Private Key', 'Password', 'JWT', 'Connection String', 'OpenAI Key', 'GitHub PAT', 'Slack Token'];
    for (let i = 0; i < SENSITIVE_PATTERNS.length; i++) {
      if (SENSITIVE_PATTERNS[i].test(content)) {
        found.push(labels[i]);
      }
    }
    return { found: found.length > 0, patterns: found };
  }
}
