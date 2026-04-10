// ============ Memory Types ============
// Extension-side type definitions mirroring the backend memory API.

// ============ Core Enums ============

export type MemoryType =
  | 'fact'
  | 'correction'
  | 'preference'
  | 'pattern'
  | 'decision'
  | 'context'
  | 'snippet'
  | 'warning';

export type MemoryScope =
  | 'global'
  | 'project'
  | 'file'
  | 'session';

// ============ Core Entities ============

export interface Memory {
  id: string;
  user_id: string | null;
  project_id: string | null;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  summary: string;
  source_type: string;
  source_message_id: string | null;
  source_chat_id: string | null;
  related_files: string[] | null;
  related_symbols: string[] | null;
  tags: string[] | null;
  confidence: number;
  access_count: number;
  last_accessed_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_pinned: boolean;
  superseded_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============ Search & Recall ============

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  relevanceReason: string;
}

export interface MemoryContext {
  memories: MemorySearchResult[];
  totalFound: number;
  tokensUsed: number;
  formatted: string;
}

// ============ Extraction ============

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  summary: string;
  confidence: number;
  tags: string[];
  relatedFiles: string[];
  relatedSymbols: string[];
  scope: MemoryScope;
}

// ============ Statistics ============

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byScope: Record<string, number>;
  avgConfidence: number;
  oldestMemory: string | null;
  newestMemory: string | null;
  mostAccessed: Memory[];
  leastConfident: Memory[];
}

// ============ Configuration ============

export interface MemoryConfig {
  enabled: boolean;
  autoExtract: boolean;
  maxMemoriesPerRequest: number;
  extractionDebounceMs: number;
  showMemoryIndicator: boolean;
  askBeforeRemembering: boolean;
}

// ============ Filters ============

export interface MemoryFilters {
  type?: MemoryType;
  scope?: MemoryScope;
  projectId?: string;
  isActive?: boolean;
  isPinned?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ============ Create / Update Payloads ============

export interface CreateMemoryPayload {
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  summary: string;
  source_type?: string;
  source_message_id?: string;
  source_chat_id?: string;
  related_files?: string[];
  related_symbols?: string[];
  tags?: string[];
  confidence?: number;
  project_id?: string;
  metadata?: Record<string, any>;
}

export interface UpdateMemoryPayload {
  content?: string;
  summary?: string;
  type?: MemoryType;
  scope?: MemoryScope;
  tags?: string[];
  confidence?: number;
  is_active?: boolean;
  is_pinned?: boolean;
  related_files?: string[];
  related_symbols?: string[];
  metadata?: Record<string, any>;
}

// ============ Search / Recall Options ============

export interface MemorySearchOptions {
  query: string;
  projectId?: string;
  limit?: number;
}

export interface MemoryRecallOptions {
  projectId?: string;
  currentFile?: string;
  limit?: number;
  scope?: MemoryScope;
  types?: MemoryType[];
}

// ============ Extraction Options ============

export interface ExtractionOptions {
  projectId?: string;
  currentFile?: string;
  chatId?: string;
  messageId?: string;
}

// ============ Feedback ============

export interface MemoryFeedback {
  memoryId: string;
  type: 'helpful' | 'not_helpful' | 'incorrect' | 'outdated';
  context?: string;
}

// ============ Events ============

export type MemoryEvent =
  | 'memory-created'
  | 'memory-recalled'
  | 'memory-updated'
  | 'memory-deleted'
  | 'extraction-complete'
  | 'feedback-submitted';

// ============ Explicit Request Detection ============

export interface RememberRequest {
  isRememberRequest: boolean;
  content: string;
}

export interface ForgetRequest {
  isForgetRequest: boolean;
  query: string;
}

// ============ Queue Item ============

export interface ExtractionQueueItem {
  userMessage: string;
  assistantMessage: string;
  context: ExtractionOptions;
  timestamp: number;
}

// ============ Constants ============

export const MEMORY_CLIENT_CONSTANTS = {
  EXTRACTION_DEBOUNCE_MS: 5000,
  MAX_RECALL_RESULTS: 10,
  RECALL_CACHE_TTL_MS: 30000,
} as const;
