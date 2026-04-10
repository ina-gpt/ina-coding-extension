export { TerminalIntegrationService } from './TerminalIntegrationService';
export { CommandExecutor } from './CommandExecutor';
export { OutputParser } from './OutputParser';
export { AutoFixEngine } from './AutoFixEngine';
export { CommandSecurityValidator } from './CommandSecurityValidator';
export { TerminalSessionManager } from './TerminalSessionManager';
export {
  TerminalCommandCategory,
  TerminalExecutionStatus,
  AutoFixStrategy,
  CommandSecurityLevel,
  COMMAND_TIMEOUTS,
  MAX_OUTPUT_BUFFER,
  MAX_AUTO_FIX_ATTEMPTS,
} from './TerminalTypes';
export type {
  TerminalCommand,
  TerminalExecution,
  TerminalParsedResult,
  ParsedError,
  ParsedWarning,
  TerminalStats,
  TerminalError,
  AutoFixRequest,
  AutoFixResult,
  TerminalSession,
  TerminalEvent,
} from './TerminalTypes';
