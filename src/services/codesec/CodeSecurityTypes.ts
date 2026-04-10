/**
 * Phase 12.3 — Code Security Types
 * Defense-in-depth type system for code security.
 */

// ============ Main Policy ============

export interface CodeSecurityPolicy {
  ephemeralProcessing: EphemeralConfig;
  sensitiveFiles: SensitiveFileConfig;
  secretProtection: SecretProtectionConfig;
  codeTransmission: CodeTransmissionConfig;
  codeStorage: CodeStorageConfig;
  agentSecurity: AgentSecurityConfig;
  auditPolicy: CodeAuditConfig;
}

// ============ Ephemeral Config ============

export interface EphemeralConfig {
  enabled: boolean;
  serverRetentionMs: number;
  deleteAfterResponse: boolean;
  noChatLogging: boolean;
  noCodeInMemory: boolean;
  ephemeralEmbeddings: boolean;
  maxServerRetentionMinutes: number;
}

// ============ Sensitive Files ============

export enum SensitiveFileAction {
  EXCLUDE = 'exclude',
  WARN = 'warn',
  REDACT = 'redact',
  ALLOW = 'allow',
}

export interface SensitiveFileConfig {
  enabled: boolean;
  autoDetect: boolean;
  patterns: string[];
  customPatterns: string[];
  action: SensitiveFileAction;
  warnOnAccess: boolean;
  blockMentions: boolean;
  scanGitDiff: boolean;
}

// ============ Secret Protection ============

export interface SecretProtectionConfig {
  enabled: boolean;
  autoStrip: boolean;
  scanBeforeSend: boolean;
  scanPastedCode: boolean;
  scanGeneratedCode: boolean;
  blockIfSecretsFound: boolean;
  notifyOnDetection: boolean;
  customPatterns: SecretPattern[];
  whitelistPatterns: string[];
}

export interface SecretPattern {
  name: string;
  pattern: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

// ============ Code Transmission ============

export interface CodeTransmissionConfig {
  maxCodeSizeBytes: number;
  maxFilesPerRequest: number;
  maxContextCodeLines: number;
  stripComments: boolean;
  stripEmptyLines: boolean;
  minifyBeforeSend: boolean;
  hashFileNames: boolean;
  excludeTestFiles: boolean;
  excludeNodeModules: boolean;
  excludeBuildOutput: boolean;
}

// ============ Code Storage ============

export interface CodeStorageConfig {
  allowServerStorage: boolean;
  allowIndexStorage: boolean;
  allowMemoryStorage: boolean;
  allowCacheStorage: boolean;
  serverStorageEncrypted: boolean;
  maxStorageDuration: 'session' | 'day' | 'week' | 'never';
  purgeOnDisconnect: boolean;
}

// ============ Agent Security ============

export interface AgentSecurityConfig {
  requireApprovalForFileCreation: boolean;
  requireApprovalForFileDeletion: boolean;
  requireApprovalForRename: boolean;
  requireApprovalForTerminal: boolean;
  blockDangerousCommands: boolean;
  blockWriteOutsideWorkspace: boolean;
  blockSymlinkFollowing: boolean;
  scanGeneratedCodeBeforeApply: boolean;
  maxFileModificationsPerSession: number;
  maxTerminalCommandsPerSession: number;
  sandboxTerminalCommands: boolean;
}

// ============ Audit ============

export interface CodeAuditConfig {
  logAllCodeAccess: boolean;
  logSensitiveFileAccess: boolean;
  logSecretDetections: boolean;
  logAgentFileOps: boolean;
  logTerminalCommands: boolean;
  logCodeTransmissions: boolean;
}

// ============ Events & Alerts ============

export type CodeSecurityEvent =
  | 'secret-detected'
  | 'secret-stripped'
  | 'sensitive-file-blocked'
  | 'sensitive-file-warned'
  | 'code-scanned'
  | 'transmission-blocked'
  | 'agent-blocked'
  | 'ephemeral-purged'
  | 'policy-violation';

export interface CodeSecurityAlert {
  id: string;
  type: CodeSecurityEvent;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  filePath: string | null;
  secretType: string | null;
  action: string;
  timestamp: number;
  dismissed: boolean;
  autoResolved: boolean;
}

// ============ Scan Results ============

export interface CodeScanResult {
  safe: boolean;
  sanitizedCode: string;
  secretsFound: SecretDetectionResult[];
  sensitiveFile: boolean;
  warnings: string[];
  blocked: boolean;
  blockReason: string | null;
}

export interface SecretDetectionResult {
  pattern: string;
  match: string;
  line: number | null;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  name: string;
}

export interface IncomingCodeScanResult {
  safe: boolean;
  warnings: string[];
  hardcodedSecrets: SecretDetectionResult[];
  maliciousPatterns: MaliciousPattern[];
}

export interface MaliciousPattern {
  type: string;
  pattern: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number | null;
}

export interface GeneratedCodeScanResult {
  safe: boolean;
  warnings: CodeWarning[];
  suggestions: string[];
  autoFixed: string | null;
  requiresReview: boolean;
}

export interface CodeWarning {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  line: number | null;
  message: string;
  fix: string | null;
}

export interface SensitiveFileScanResult {
  sensitiveFiles: { path: string; pattern: string; action: SensitiveFileAction }[];
  secretsInFiles: { path: string; secrets: SecretDetectionResult[] }[];
  totalFiles: number;
  totalSensitive: number;
  totalSecrets: number;
}

// ============ Default Sensitive File Patterns ============

export const DEFAULT_SENSITIVE_PATTERNS: string[] = [
  '.env', '.env.local', '.env.production', '.env.staging', '.env.development', '.env.test',
  '.env.*',
  '*.pem', '*.key', '*.cert', '*.crt', '*.p12', '*.pfx', '*.jks',
  'id_rsa', 'id_rsa.*', 'id_ed25519', 'id_ed25519.*', 'id_ecdsa', 'id_dsa',
  '.ssh/*', '.gnupg/*',
  'credentials', 'credentials.*', '*.credentials',
  'secrets', 'secrets.*', '*.secret', '*.secrets',
  '.npmrc', '.pypirc', '.gem/credentials',
  'docker-compose.override.yml', 'docker-compose.prod.yml',
  '.htpasswd', '.htaccess',
  'wp-config.php', 'web.config',
  'serviceAccountKey.json', '*-service-account.json',
  'firebase-adminsdk*.json',
  'terraform.tfvars', '*.tfvars',
  'vault-config.*',
  'kubeconfig', '.kube/config',
  'aws-credentials', '.aws/credentials', '.aws/config',
  '.gcloud/*',
  'private.key', 'private_key.*',
  '*.keystore', '*.truststore',
  'token', 'token.*', '*.token',
  'auth.json', 'auth.yaml', 'auth.yml',
];

// ============ Default Secret Patterns ============

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  { name: 'AWS Access Key', pattern: 'AKIA[0-9A-Z]{16}', type: 'cloud_credential', severity: 'critical', description: 'AWS access key ID' },
  { name: 'AWS Secret Key', pattern: '(?:aws_secret_access_key|AWS_SECRET)\\s*[:=]\\s*[A-Za-z0-9/+=]{40}', type: 'cloud_credential', severity: 'critical', description: 'AWS secret access key' },
  { name: 'GitHub Token', pattern: 'gh[pousr]_[A-Za-z0-9_]{36,}', type: 'api_token', severity: 'critical', description: 'GitHub personal access token' },
  { name: 'GitLab Token', pattern: 'glpat-[A-Za-z0-9_-]{20,}', type: 'api_token', severity: 'critical', description: 'GitLab personal access token' },
  { name: 'Slack Token', pattern: 'xox[baprs]-[A-Za-z0-9-]{10,}', type: 'api_token', severity: 'high', description: 'Slack bot or user token' },
  { name: 'Google API Key', pattern: 'AIza[0-9A-Za-z_-]{35}', type: 'api_key', severity: 'high', description: 'Google API key' },
  { name: 'Stripe Secret Key', pattern: 'sk_(?:live|test)_[A-Za-z0-9]{24,}', type: 'payment', severity: 'critical', description: 'Stripe secret key' },
  { name: 'Stripe Publishable', pattern: 'pk_(?:live|test)_[A-Za-z0-9]{24,}', type: 'payment', severity: 'medium', description: 'Stripe publishable key' },
  { name: 'OpenAI Key', pattern: 'sk-[A-Za-z0-9]{48,}', type: 'api_key', severity: 'high', description: 'OpenAI API key' },
  { name: 'Anthropic Key', pattern: 'sk-ant-[A-Za-z0-9-]{90,}', type: 'api_key', severity: 'high', description: 'Anthropic API key' },
  { name: 'Private Key Block', pattern: '-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', type: 'private_key', severity: 'critical', description: 'PEM private key block' },
  { name: 'JWT Token', pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}', type: 'token', severity: 'high', description: 'JSON Web Token' },
  { name: 'Database URL', pattern: '(?:postgres|mysql|mongodb|redis|amqp)(?:ql)?(?:\\+srv)?:\\/\\/[^\\s]{10,}', type: 'connection_string', severity: 'critical', description: 'Database connection string with credentials' },
  { name: 'Password Assignment', pattern: '(?:password|passwd|pwd|pass)\\s*[:=]\\s*["\'][^"\']{4,}["\']', type: 'password', severity: 'high', description: 'Hardcoded password assignment' },
  { name: 'API Key Assignment', pattern: '(?:api[_-]?key|apikey|api[_-]?secret)\\s*[:=]\\s*["\'][^"\']{8,}["\']', type: 'api_key', severity: 'high', description: 'Hardcoded API key or secret' },
  { name: 'Bearer Token', pattern: 'Bearer\\s+[A-Za-z0-9._-]{20,}', type: 'token', severity: 'high', description: 'Bearer authorization token' },
  { name: 'Heroku API Key', pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', type: 'api_key', severity: 'medium', description: 'UUID-format API key (Heroku, etc.)' },
  { name: 'SSH Connection', pattern: 'ssh\\s+-i\\s+\\S+\\s+\\S+@\\S+', type: 'connection', severity: 'medium', description: 'SSH connection command with key' },
  { name: 'Slack Webhook', pattern: 'https:\\/\\/hooks\\.slack\\.com\\/services\\/[A-Za-z0-9/]+', type: 'webhook', severity: 'high', description: 'Slack incoming webhook URL' },
  { name: 'Discord Webhook', pattern: 'https:\\/\\/discord(?:app)?\\.com\\/api\\/webhooks\\/[0-9]+\\/[A-Za-z0-9_-]+', type: 'webhook', severity: 'high', description: 'Discord webhook URL' },
  { name: 'Telegram Bot Token', pattern: '[0-9]+:AA[A-Za-z0-9_-]{33}', type: 'api_token', severity: 'high', description: 'Telegram bot API token' },
  { name: 'SendGrid Key', pattern: 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}', type: 'api_key', severity: 'high', description: 'SendGrid API key' },
  { name: 'Twilio Key', pattern: 'SK[0-9a-fA-F]{32}', type: 'api_key', severity: 'high', description: 'Twilio API key' },
  { name: 'Mailgun Key', pattern: 'key-[0-9a-zA-Z]{32}', type: 'api_key', severity: 'high', description: 'Mailgun API key' },
];

// ============ Malicious Code Patterns ============

export const MALICIOUS_CODE_PATTERNS: MaliciousPattern[] = [
  { type: 'code_injection', pattern: '\\beval\\s*\\(', description: 'eval() can execute arbitrary code', severity: 'high', line: null },
  { type: 'command_injection', pattern: 'child_process\\.(?:exec|execSync|spawn)\\s*\\(.*\\$\\{', description: 'Unsanitized input in shell command', severity: 'critical', line: null },
  { type: 'path_traversal', pattern: '\\.\\.\\/.*(?:readFile|writeFile|unlink|rmdir)', description: 'Path traversal in file operations', severity: 'high', line: null },
  { type: 'prototype_pollution', pattern: '__proto__|constructor\\.prototype', description: 'Prototype pollution attack vector', severity: 'high', line: null },
  { type: 'sql_injection', pattern: '(?:query|execute)\\s*\\(\\s*[`"\'].*\\$\\{', description: 'SQL injection via string interpolation', severity: 'critical', line: null },
  { type: 'xss', pattern: '\\.innerHTML\\s*=(?!\\s*[\'"]\\s*[\'"])', description: 'innerHTML assignment without sanitization', severity: 'high', line: null },
  { type: 'insecure_tls', pattern: 'rejectUnauthorized\\s*:\\s*false', description: 'TLS certificate validation disabled', severity: 'high', line: null },
  { type: 'insecure_protocol', pattern: 'http:\\/\\/(?!localhost|127\\.0\\.0\\.1)', description: 'Non-TLS HTTP URL (use HTTPS)', severity: 'medium', line: null },
  { type: 'shell_injection', pattern: '`.*\\$\\(.*\\)`', description: 'Shell command substitution in template literal', severity: 'high', line: null },
  { type: 'redos', pattern: '\\([^)]*\\+\\)[^*+?]*\\+', description: 'Potential ReDoS catastrophic backtracking regex', severity: 'medium', line: null },
  { type: 'obfuscation', pattern: 'Buffer\\.from\\([\'"][A-Za-z0-9+/=]{50,}[\'"],\\s*[\'"]base64[\'"]\\)', description: 'Large base64-encoded payload (possible obfuscation)', severity: 'medium', line: null },
  { type: 'network_exfil', pattern: 'fetch\\s*\\(\\s*[`"\'](https?:\\/\\/(?!localhost)[^"\'`]+)', description: 'Network request to external host in generated code', severity: 'low', line: null },
];

// ============ Default Configuration ============

export const CODE_SECURITY_DEFAULTS: CodeSecurityPolicy = {
  ephemeralProcessing: {
    enabled: true,
    serverRetentionMs: 0,
    deleteAfterResponse: true,
    noChatLogging: true,
    noCodeInMemory: false,
    ephemeralEmbeddings: false,
    maxServerRetentionMinutes: 0,
  },
  sensitiveFiles: {
    enabled: true,
    autoDetect: true,
    patterns: [...DEFAULT_SENSITIVE_PATTERNS],
    customPatterns: [],
    action: SensitiveFileAction.EXCLUDE,
    warnOnAccess: true,
    blockMentions: true,
    scanGitDiff: true,
  },
  secretProtection: {
    enabled: true,
    autoStrip: true,
    scanBeforeSend: true,
    scanPastedCode: true,
    scanGeneratedCode: true,
    blockIfSecretsFound: false,
    notifyOnDetection: true,
    customPatterns: [],
    whitelistPatterns: [],
  },
  codeTransmission: {
    maxCodeSizeBytes: 524288,
    maxFilesPerRequest: 10,
    maxContextCodeLines: 500,
    stripComments: false,
    stripEmptyLines: false,
    minifyBeforeSend: false,
    hashFileNames: false,
    excludeTestFiles: false,
    excludeNodeModules: true,
    excludeBuildOutput: true,
  },
  codeStorage: {
    allowServerStorage: false,
    allowIndexStorage: true,
    allowMemoryStorage: true,
    allowCacheStorage: true,
    serverStorageEncrypted: true,
    maxStorageDuration: 'session',
    purgeOnDisconnect: false,
  },
  agentSecurity: {
    requireApprovalForFileCreation: true,
    requireApprovalForFileDeletion: true,
    requireApprovalForRename: true,
    requireApprovalForTerminal: true,
    blockDangerousCommands: true,
    blockWriteOutsideWorkspace: true,
    blockSymlinkFollowing: true,
    scanGeneratedCodeBeforeApply: true,
    maxFileModificationsPerSession: 50,
    maxTerminalCommandsPerSession: 20,
    sandboxTerminalCommands: false,
  },
  auditPolicy: {
    logAllCodeAccess: false,
    logSensitiveFileAccess: true,
    logSecretDetections: true,
    logAgentFileOps: true,
    logTerminalCommands: true,
    logCodeTransmissions: false,
  },
};
