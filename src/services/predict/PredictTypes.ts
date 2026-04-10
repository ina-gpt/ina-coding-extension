/**
 * Phase 15.3 — Predicted Next Edit Types
 */

export enum EditType {
  RENAME = 'rename',
  ADD_PARAMETER = 'add_param',
  CHANGE_TYPE = 'change_type',
  ADD_IMPORT = 'add_import',
  ADD_MEMBER = 'add_member',
  CHANGE_SIGNATURE = 'change_sig',
  ADD_ERROR_HANDLING = 'add_error',
  MODIFY_BODY = 'modify_body',
  DELETE = 'delete',
  INSERT = 'insert',
  REPLACE = 'replace',
  GENERIC = 'generic',
}

export interface EditEvent {
  timestamp: number;
  filePath: string;
  line: number;
  column: number;
  oldText: string;
  newText: string;
  editType: EditType;
  symbolName: string | null;
  scope: string | null;
}

export interface PredictedEdit {
  id: string;
  filePath: string;
  line: number;
  column: number;
  oldText: string;
  newText: string;
  reason: string;
  confidence: number;
  editType: EditType;
  relatedToEditId: string | null;
  priority: number;
  previewText: string;
}

export interface PredictionChain {
  id: string;
  triggerEdit: EditEvent;
  predictions: PredictedEdit[];
  currentIndex: number;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  createdAt: number;
}

export interface PredictionResult {
  predictions: PredictedEdit[];
  method: 'rules' | 'lsp' | 'llm' | 'combined';
  latencyMs: number;
}

export interface PredictConfig {
  enabled: boolean;
  maxPredictions: number;
  minConfidence: number;
  includeOtherFiles: boolean;
  useLLMFallback: boolean;
  llmTimeoutMs: number;
  showStatusBar: boolean;
}

export const PREDICTION_CONSTANTS = {
  MAX_CHAIN_LENGTH: 10,
  CHAIN_EXPIRY_MS: 60000,
  DEBOUNCE_MS: 300,
  MAX_FILES_TO_SCAN: 20,
  MAX_REFERENCES_TO_CHECK: 50,
  LLM_TIMEOUT_MS: 3000,
  CACHE_TTL_MS: 10000,
};
