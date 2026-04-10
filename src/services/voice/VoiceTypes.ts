/**
 * VoiceTypes.ts — Phase 20 Step 20.2
 * Voice-to-Code type definitions
 */

export interface VoiceCommand {
  transcript: string;
  confidence: number;
  language: string;
  timestamp: number;
  duration: number;
}

export enum VoiceIntentType {
  WRITE_CODE = 'write_code',
  EDIT_LINE = 'edit_line',
  GO_TO_FILE = 'go_to_file',
  GO_TO_FUNCTION = 'go_to_function',
  RUN_COMMAND = 'run_command',
  ASK_QUESTION = 'ask_question',
  DICTATE_COMMENT = 'dictate_comment',
  RENAME_VARIABLE = 'rename_variable',
  DELETE_LINES = 'delete_lines',
  UNDO = 'undo',
  REDO = 'redo',
  EXPLAIN_CODE = 'explain_code',
  FIX_ERROR = 'fix_error',
  GENERATE_TEST = 'generate_test',
  UNKNOWN = 'unknown',
}

export interface VoiceIntent {
  type: VoiceIntentType;
  parsed: Record<string, any>;
  rawTranscript: string;
  confidence: number;
}

export interface VoiceConfig {
  language: string;
  sttEndpoint: string;
  ttsEndpoint: string;
  pushToTalk: boolean;
  hotkey: string;
  continuousListening: boolean;
  feedbackVoice: boolean;
  noiseThreshold: number;
  silenceTimeoutMs: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  language: 'auto',
  sttEndpoint: 'http://localhost:5051',
  ttsEndpoint: 'http://localhost:6006',
  pushToTalk: true,
  hotkey: 'cmd+shift+v',
  continuousListening: false,
  feedbackVoice: true,
  noiseThreshold: 0.5,
  silenceTimeoutMs: 1500,
};

export interface VoiceSession {
  id: string;
  startedAt: number;
  commands: VoiceCommand[];
  isListening: boolean;
  isPaused: boolean;
}

export type VoiceStatus = 'ready' | 'recording' | 'processing' | 'done' | 'error';
