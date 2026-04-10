/**
 * Phase 12.1 — Privacy Audit Service
 * Provides privacy audit capabilities and compliance reporting.
 */
import { Logger } from '../../utils/Logger';
import { PrivacyMode, PrivacyAuditReport, AuditFinding, ComplianceStatus, DataInventory } from './PrivacyTypes';
import { PrivacyModeManager } from './PrivacyModeManager';
import { SecretDetector } from './SecretDetector';
import { DataEncryptionService } from './DataEncryptionService';

export class PrivacyAuditService {
  private static instance: PrivacyAuditService;

  static getInstance(): PrivacyAuditService {
    if (!PrivacyAuditService.instance) {
      PrivacyAuditService.instance = new PrivacyAuditService();
    }
    return PrivacyAuditService.instance;
  }

  private constructor() {}

  async runFullAudit(): Promise<PrivacyAuditReport> {
    const pm = PrivacyModeManager.getInstance();
    const config = pm.getConfig();
    const findings: AuditFinding[] = [];

    // Encryption
    const enc = DataEncryptionService.getInstance();
    if (!enc.isReady()) {
      findings.push({ severity: 'warning', category: 'Encryption', description: 'Data encryption is not initialized', recommendation: 'Restart VS Code to initialize encryption' });
    }
    if (!config.encryption.encryptAtRest) {
      findings.push({ severity: 'warning', category: 'Encryption', description: 'Encryption at rest is disabled', recommendation: 'Enable encryption in privacy settings' });
    }

    // TLS
    if (!config.communication.requireTLS) {
      findings.push({ severity: 'critical', category: 'Communication', description: 'TLS is not required for API calls', recommendation: 'Enable TLS requirement in privacy settings' });
    }

    // Telemetry
    if (config.telemetry.enabled) {
      findings.push({ severity: 'info', category: 'Telemetry', description: 'Telemetry is enabled', recommendation: 'Review what data is being sent' });
    }

    // Data minimization
    if (!config.dataMinimization.excludeSecrets) {
      findings.push({ severity: 'critical', category: 'Data Minimization', description: 'Secret detection is disabled', recommendation: 'Enable secret detection to prevent leaking credentials' });
    }
    if (!config.dataMinimization.excludeEnvFiles) {
      findings.push({ severity: 'warning', category: 'Data Minimization', description: '.env files are not excluded from AI context', recommendation: 'Enable .env file exclusion' });
    }

    // Retention
    if (!config.dataRetention.autoDeleteExpired) {
      findings.push({ severity: 'warning', category: 'Retention', description: 'Auto-delete of expired data is disabled', recommendation: 'Enable auto-delete for data hygiene' });
    }

    // Secret scan
    const secretStats = SecretDetector.getInstance().getStats();
    if (secretStats.totalDetections > 0) {
      findings.push({ severity: 'info', category: 'Secrets', description: `${secretStats.totalDetections} secrets detected and redacted this session`, recommendation: 'Review detected secret types' });
    }

    // Compliance status
    const compliance: ComplianceStatus = {
      gdprCompliant: this.isGDPRCompliant(config),
      dataMinimized: config.dataMinimization.excludeSecrets && config.dataMinimization.stripFilePathsInLogs,
      encryptionEnabled: config.encryption.encryptAtRest && enc.isReady(),
      retentionPolicyActive: config.dataRetention.autoDeleteExpired,
      consentManaged: true,
      auditLogging: true,
      rightToErasure: true,
      rightToPortability: true,
      issues: findings.filter(f => f.severity === 'critical').map(f => f.description),
    };

    const recommendations: string[] = [];
    if (!compliance.encryptionEnabled) recommendations.push('Enable encryption at rest for sensitive data');
    if (!compliance.retentionPolicyActive) recommendations.push('Enable auto-delete to comply with data minimization');
    if (findings.some(f => f.severity === 'critical')) recommendations.push('Address critical findings immediately');

    return {
      timestamp: Date.now(),
      mode: config.mode,
      findings,
      dataInventory: pm.getDataInventory(),
      complianceStatus: compliance,
      recommendations,
    };
  }

  getPrivacySummary(): string {
    const pm = PrivacyModeManager.getInstance();
    const config = pm.getConfig();
    const enc = DataEncryptionService.getInstance();
    const parts: string[] = [];
    parts.push(`${config.mode} mode`);
    if (enc.isReady()) parts.push('Encrypted');
    if (!config.telemetry.enabled) parts.push('No telemetry');
    parts.push(`${config.dataRetention.chatHistoryDays}d retention`);
    if (this.isGDPRCompliant(config)) parts.push('GDPR compliant');
    return `Privacy: ${parts.join(' • ')}`;
  }

  private isGDPRCompliant(config: any): boolean {
    return config.dataRetention.autoDeleteExpired && config.dataMinimization.excludeSecrets && config.encryption.encryptAtRest;
  }
}
