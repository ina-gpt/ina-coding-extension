/**
 * Phase 12.3 — Code Transmission Monitor
 * Monitors and audits ALL code transmission in and out of the extension.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

interface TransmissionEntry {
  timestamp: number;
  direction: 'outgoing' | 'incoming';
  category: string;
  filePath: string | null;
  sizeBytes: number;
  secretsStripped: number;
  truncated: boolean;
}

interface SessionStats {
  totalOutgoingBytes: number;
  totalIncomingBytes: number;
  totalSecretsStripped: number;
  totalFilesScanned: number;
  totalTransmissions: number;
  startTime: number;
  byCategory: Record<string, number>;
}

const DATA_VOLUME_WARN_BYTES = 50 * 1024 * 1024; // 50MB

export class CodeTransmissionMonitor extends EventEmitter {
  private static instance: CodeTransmissionMonitor;
  private transmissionLog: TransmissionEntry[] = [];
  private sessionStats: SessionStats;

  static getInstance(): CodeTransmissionMonitor {
    if (!CodeTransmissionMonitor.instance) {
      CodeTransmissionMonitor.instance = new CodeTransmissionMonitor();
    }
    return CodeTransmissionMonitor.instance;
  }

  private constructor() {
    super();
    this.sessionStats = this.createEmptyStats();
  }

  recordOutgoingTransmission(data: { category: string; filePath: string | null; sizeBytes: number; secretsStripped: number; truncated: boolean }): void {
    const entry: TransmissionEntry = { timestamp: Date.now(), direction: 'outgoing', ...data };
    this.transmissionLog.push(entry);
    if (this.transmissionLog.length > 500) this.transmissionLog = this.transmissionLog.slice(-400);

    this.sessionStats.totalOutgoingBytes += data.sizeBytes;
    this.sessionStats.totalSecretsStripped += data.secretsStripped;
    this.sessionStats.totalFilesScanned++;
    this.sessionStats.totalTransmissions++;
    this.sessionStats.byCategory[data.category] = (this.sessionStats.byCategory[data.category] || 0) + 1;

    this.checkThresholds();
  }

  recordIncomingTransmission(data: { category: string; sizeBytes: number }): void {
    const entry: TransmissionEntry = { timestamp: Date.now(), direction: 'incoming', filePath: null, secretsStripped: 0, truncated: false, ...data };
    this.transmissionLog.push(entry);
    if (this.transmissionLog.length > 500) this.transmissionLog = this.transmissionLog.slice(-400);

    this.sessionStats.totalIncomingBytes += data.sizeBytes;
    this.sessionStats.totalTransmissions++;
    this.sessionStats.byCategory[data.category] = (this.sessionStats.byCategory[data.category] || 0) + 1;
  }

  getTransmissionLog(limit?: number): TransmissionEntry[] {
    const log = [...this.transmissionLog].reverse();
    return limit ? log.slice(0, limit) : log;
  }

  getSessionStats(): SessionStats {
    return { ...this.sessionStats };
  }

  generateTransmissionReport(): string {
    const s = this.sessionStats;
    const duration = Date.now() - s.startTime;
    const durationMin = Math.round(duration / 60000);
    const outKB = (s.totalOutgoingBytes / 1024).toFixed(1);
    const inKB = (s.totalIncomingBytes / 1024).toFixed(1);
    const outCount = this.transmissionLog.filter(t => t.direction === 'outgoing').length;
    const inCount = this.transmissionLog.filter(t => t.direction === 'incoming').length;

    const categoryBreakdown = Object.entries(s.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `  - ${cat}: ${count} (${Math.round(count / Math.max(s.totalTransmissions, 1) * 100)}%)`)
      .join('\n');

    return [
      '# Code Transmission Report',
      '',
      `**Session Duration:** ${durationMin} minutes`,
      '',
      '## Summary',
      `- **Outgoing:** ${outCount} transmissions, ${outKB} KB total`,
      `- **Incoming:** ${inCount} transmissions, ${inKB} KB total`,
      `- **Secrets Stripped:** ${s.totalSecretsStripped}`,
      `- **Files Scanned:** ${s.totalFilesScanned}`,
      '',
      '## Category Breakdown',
      categoryBreakdown || '  No transmissions yet',
      '',
      '## Recent Transmissions',
      ...this.transmissionLog.slice(-10).reverse().map(t => {
        const dir = t.direction === 'outgoing' ? '→' : '←';
        const size = (t.sizeBytes / 1024).toFixed(1);
        const time = new Date(t.timestamp).toLocaleTimeString();
        const secrets = t.secretsStripped > 0 ? ` (${t.secretsStripped} secrets stripped)` : '';
        return `- ${time} ${dir} [${t.category}] ${t.filePath || 'N/A'} — ${size} KB${secrets}`;
      }),
    ].join('\n');
  }

  resetSession(): void {
    this.transmissionLog = [];
    this.sessionStats = this.createEmptyStats();
  }

  private checkThresholds(): void {
    if (this.sessionStats.totalOutgoingBytes > DATA_VOLUME_WARN_BYTES) {
      Logger.warn(`[Transmission] High data volume: ${(this.sessionStats.totalOutgoingBytes / 1024 / 1024).toFixed(1)} MB sent this session`);
      this.emit('threshold-exceeded', { type: 'data-volume', bytes: this.sessionStats.totalOutgoingBytes });
    }
  }

  private createEmptyStats(): SessionStats {
    return {
      totalOutgoingBytes: 0, totalIncomingBytes: 0,
      totalSecretsStripped: 0, totalFilesScanned: 0,
      totalTransmissions: 0, startTime: Date.now(),
      byCategory: {},
    };
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
