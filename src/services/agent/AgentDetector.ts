import { isMultiFileRequest, extractFileReferences } from './AgentTypes';
import { ConfigManager } from '../../utils/ConfigManager';

interface DetectionResult {
  shouldUseAgent: boolean;
  confidence: number;
  reasons: string[];
  detectedOperations: string[];
}

interface ComplexityAnalysis {
  fileCount: number;
  operationTypes: string[];
  estimatedSteps: number;
}

interface MessageContext {
  currentFile?: string;
  hasImports?: boolean;
  openFileCount?: number;
}

// ============ Pattern Categories ============

const FILE_OP_PATTERNS: Array<{ pattern: RegExp; op: string; confidence: number }> = [
  { pattern: /\bcreate\s+(?:a\s+)?(?:new\s+)?file\b/i, op: 'create_file', confidence: 0.9 },
  { pattern: /\bcreate\s+(?:a\s+)?(?:new\s+)?folder\b/i, op: 'create_folder', confidence: 0.9 },
  { pattern: /\bdelete\s+(?:the\s+)?file\b/i, op: 'delete_file', confidence: 0.9 },
  { pattern: /\brename\s+(?:the\s+)?file\b/i, op: 'rename_file', confidence: 0.9 },
  { pattern: /\bmove\s+(?:the\s+)?file\b/i, op: 'move_file', confidence: 0.9 },
];

const MULTI_FILE_PATTERNS: Array<{ pattern: RegExp; op: string; confidence: number }> = [
  { pattern: /\ball\s+files\b/i, op: 'multi_file', confidence: 0.85 },
  { pattern: /\bevery\s+file\b/i, op: 'multi_file', confidence: 0.85 },
  { pattern: /\bacross\s+(?:the\s+)?project\b/i, op: 'multi_file', confidence: 0.85 },
  { pattern: /\brefactor\s+all\b/i, op: 'refactor', confidence: 0.85 },
  { pattern: /\bupdate\s+every\b/i, op: 'multi_update', confidence: 0.85 },
  { pattern: /\bmultiple\s+files\b/i, op: 'multi_file', confidence: 0.85 },
];

const TERMINAL_PATTERNS: Array<{ pattern: RegExp; op: string; confidence: number }> = [
  { pattern: /\brun\s+(?:the\s+)?tests?\b/i, op: 'terminal', confidence: 0.7 },
  { pattern: /\bnpm\s+(?:install|run|build|test)\b/i, op: 'terminal', confidence: 0.7 },
  { pattern: /\byarn\s+(?:add|install|build|test)\b/i, op: 'terminal', confidence: 0.7 },
  { pattern: /\bbuild\s+(?:the\s+)?project\b/i, op: 'terminal', confidence: 0.7 },
  { pattern: /\bexecute\b/i, op: 'terminal', confidence: 0.65 },
];

const STRUCTURAL_PATTERNS: Array<{ pattern: RegExp; op: string; confidence: number }> = [
  { pattern: /\badd\s+(?:a\s+)?new\s+component\b/i, op: 'create_component', confidence: 0.8 },
  { pattern: /\bcreate\s+(?:a\s+)?module\b/i, op: 'create_module', confidence: 0.8 },
  { pattern: /\bset\s+up\s+(?:routing|auth|testing|ci)\b/i, op: 'setup', confidence: 0.8 },
  { pattern: /\badd\s+authentication\b/i, op: 'setup', confidence: 0.8 },
  { pattern: /\bscaffold\b/i, op: 'scaffold', confidence: 0.85 },
  { pattern: /\bgenerate\b.*(?:component|model|service|controller)/i, op: 'generate', confidence: 0.8 },
  { pattern: /\bbootstrap\b/i, op: 'scaffold', confidence: 0.8 },
  { pattern: /\badd\s+(?:a\s+)?(?:new\s+)?(?:endpoint|api|feature)\b/i, op: 'create_feature', confidence: 0.8 },
  { pattern: /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:page|route|view)\b/i, op: 'create_page', confidence: 0.8 },
];

export class AgentDetector {
  private static instance: AgentDetector;

  static getInstance(): AgentDetector {
    if (!AgentDetector.instance) {
      AgentDetector.instance = new AgentDetector();
    }
    return AgentDetector.instance;
  }

  detectAgentIntent(message: string, context?: MessageContext): DetectionResult {
    const reasons: string[] = [];
    const detectedOps: string[] = [];
    let maxConfidence = 0;

    // Check all pattern categories
    const allPatterns = [
      ...FILE_OP_PATTERNS,
      ...MULTI_FILE_PATTERNS,
      ...TERMINAL_PATTERNS,
      ...STRUCTURAL_PATTERNS,
    ];

    for (const { pattern, op, confidence } of allPatterns) {
      if (pattern.test(message)) {
        detectedOps.push(op);
        reasons.push(`Detected: ${op}`);
        maxConfidence = Math.max(maxConfidence, confidence);
      }
    }

    // Check for multiple file path references
    const filePaths = extractFileReferences(message);
    if (filePaths.length >= 2) {
      detectedOps.push('multi_file_ref');
      reasons.push(`References ${filePaths.length} files`);
      maxConfidence = Math.max(maxConfidence, 0.85);
    }

    // Context boost: if current file has imports that need updating
    if (context?.hasImports && detectedOps.length > 0) {
      maxConfidence = Math.min(1, maxConfidence + 0.1);
      reasons.push('Context: file has imports that may need updating');
    }

    // Multiple operations boost confidence
    if (detectedOps.length >= 2) {
      maxConfidence = Math.min(1, maxConfidence + 0.05);
    }

    const threshold = this.getConfidenceThreshold();

    return {
      shouldUseAgent: maxConfidence >= threshold,
      confidence: maxConfidence,
      reasons,
      detectedOperations: [...new Set(detectedOps)],
    };
  }

  analyzeComplexity(message: string): ComplexityAnalysis {
    const filePaths = extractFileReferences(message);
    const ops: string[] = [];

    for (const { pattern, op } of [...FILE_OP_PATTERNS, ...MULTI_FILE_PATTERNS, ...STRUCTURAL_PATTERNS]) {
      if (pattern.test(message)) ops.push(op);
    }

    let estimatedSteps = Math.max(1, ops.length);
    if (ops.includes('multi_file') || ops.includes('refactor')) {
      estimatedSteps = Math.max(estimatedSteps, 5);
    }
    if (ops.includes('scaffold') || ops.includes('setup')) {
      estimatedSteps = Math.max(estimatedSteps, 8);
    }

    return {
      fileCount: Math.max(filePaths.length, ops.includes('multi_file') ? 3 : 1),
      operationTypes: [...new Set(ops)],
      estimatedSteps,
    };
  }

  extractFileReferences(message: string): string[] {
    return extractFileReferences(message);
  }

  getConfidenceThreshold(): number {
    try {
      return ConfigManager.get<number>('agent.autoDetectThreshold', 0.7);
    } catch {
      return 0.7;
    }
  }
}
