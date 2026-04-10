// Completion Types
export {
  CompletionTriggerKind,
  CompletionStatus,
  DEFAULT_TRIGGER_CHARACTERS,
  DEFAULT_CONFIG,
} from './CompletionTypes';
export type {
  CompletionContext,
  CompletionConfig,
  CompletionItem,
  CompletionMetrics,
  CompletionRequest,
  CompletionResponse,
  CursorContext,
  RecentEdit,
} from './CompletionTypes';

// Completion Services
export { CompletionDebouncer } from './CompletionDebouncer';
export { CompletionContextBuilder } from './CompletionContextBuilder';
export { CompletionTriggerManager } from './CompletionTriggerManager';
export { CompletionRequestManager } from './CompletionRequestManager';
export { CompletionCache } from './CompletionCache';
export { CompletionClient } from './CompletionClient';

// FIM System
export { FIMPromptBuilder } from './fim/FIMPromptBuilder';
export { FIMPostProcessor } from './fim/FIMPostProcessor';
export { FIMModelRouter } from './fim/FIMModelRouter';
export { FIMStreamHandler } from './fim/FIMStreamHandler';
export {
  FIMModel,
  getFIMTokensForModel,
  getStopSequences,
} from './fim/FIMTypes';

// Context subsystem (selective: FileContext and TokenBudget excluded to avoid
// collision with ActiveEditorTracker.FileContext and TokenCounter.TokenBudget;
// import directly from './completion/context' for those types)
export { PrefixExtractor } from './context/PrefixExtractor';
export { SuffixExtractor } from './context/SuffixExtractor';
export { ImportAnalyzer } from './context/ImportAnalyzer';
export { RelatedFileFinder } from './context/RelatedFileFinder';
export { RecentEditsTracker } from './context/RecentEditsTracker';
export { TokenBudgetManager } from './context/TokenBudgetManager';
export { ContextAggregator } from './context/ContextAggregator';
export { ContextFormatter } from './context/ContextFormatter';
export type {
  PrefixContext, SuffixContext, ImportSpecifier, ImportStatement,
  ImportContext, RelatedFile, RelatedFileContext, SessionEdit, EditPattern,
  RecentEditContext, DocumentSymbol, DiagnosticInfo, ProjectContext,
  FullCompletionContext,
} from './context/ContextTypes';
export { DEFAULT_TOKEN_BUDGET } from './context/ContextTypes';

// Ghost Text subsystem
export * from './ghosttext';

// Quality subsystem
export * from './quality';
