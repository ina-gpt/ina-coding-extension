// ============ Model Enum ============

export enum FIMModel {
  QWEN_CODER_32B = 'qwen2.5-coder:32b',
  QWEN_CODER_14B = 'qwen2.5-coder:14b',
  QWEN_CODER_7B = 'qwen2.5-coder:7b',
  DEEPSEEK_CODER = 'deepseek-coder:33b',
  CODELLAMA = 'codellama:34b',
  STARCODER2 = 'starcoder2:15b',
}

// ============ FIM Token Formats ============

export interface FIMTokens {
  prefix: string;
  suffix: string;
  middle: string;
  endOfText: string;
  padding: string | null;
  repository: string | null;
  file: string | null;
}

export const QWEN_FIM_TOKENS: FIMTokens = {
  prefix: '<|fim_prefix|>',
  suffix: '<|fim_suffix|>',
  middle: '<|fim_middle|>',
  endOfText: '<|endoftext|>',
  padding: '<|fim_pad|>',
  repository: '<|repo_name|>',
  file: '<|file_sep|>',
};

export const DEEPSEEK_FIM_TOKENS: FIMTokens = {
  prefix: '<｜fim▁begin｜>',
  suffix: '<｜fim▁hole｜>',
  middle: '<｜fim▁end｜>',
  endOfText: '<｜end▁of▁sentence｜>',
  padding: null,
  repository: null,
  file: null,
};

export const CODELLAMA_FIM_TOKENS: FIMTokens = {
  prefix: '<PRE> ',
  suffix: ' <SUF>',
  middle: ' <MID>',
  endOfText: ' ',
  padding: null,
  repository: null,
  file: null,
};

export const STARCODER_FIM_TOKENS: FIMTokens = {
  prefix: '<fim_prefix>',
  suffix: '<fim_suffix>',
  middle: '<fim_middle>',
  endOfText: '<|endoftext|>',
  padding: '<fim_pad>',
  repository: '<repo_name>',
  file: '<file_sep>',
};

// ============ Model → Token Mapping ============

export const MODEL_FIM_TOKENS: Record<string, FIMTokens> = {
  'qwen2.5-coder:32b': QWEN_FIM_TOKENS,
  'qwen2.5-coder:14b': QWEN_FIM_TOKENS,
  'qwen2.5-coder:7b': QWEN_FIM_TOKENS,
  'qwen3:14b': QWEN_FIM_TOKENS,
  'qwen3:8b': QWEN_FIM_TOKENS,
  'deepseek-coder:33b': DEEPSEEK_FIM_TOKENS,
  'deepseek-coder:6.7b': DEEPSEEK_FIM_TOKENS,
  'codellama:34b': CODELLAMA_FIM_TOKENS,
  'codellama:13b': CODELLAMA_FIM_TOKENS,
  'codellama:7b': CODELLAMA_FIM_TOKENS,
  'starcoder2:15b': STARCODER_FIM_TOKENS,
  'starcoder2:7b': STARCODER_FIM_TOKENS,
  'starcoder2:3b': STARCODER_FIM_TOKENS,
};

// ============ FIM Request/Response ============

export interface FIMRequest {
  id: string;
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  model: string;
  maxTokens: number;
  temperature: number;
  stopSequences: string[];
  repositoryContext?: string;
  fileContext?: string;
}

export interface FIMResponse {
  requestId: string;
  completion: string;
  model: string;
  tokens: number;
  latency: number;
  stopReason: 'stop' | 'length' | 'end_of_text' | 'error';
  rawResponse?: string;
}

// ============ Post-Processing ============

export interface PostProcessingRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  languages: string[] | '*';
  priority: number;
}

export interface PostProcessingResult {
  original: string;
  processed: string;
  rulesApplied: string[];
  trimmed: boolean;
  bracketBalanced: boolean;
}

// ============ Quality Metrics ============

export interface FIMQualityMetrics {
  confidence: number;
  syntaxValid: boolean;
  bracketBalanced: boolean;
  indentationConsistent: boolean;
  length: number;
  lineCount: number;
  hasTrailingNewline: boolean;
  containsSpecialTokens: boolean;
}

// ============ Language-Specific Stop Sequences ============

export const LANGUAGE_STOP_SEQUENCES: Record<string, string[]> = {
  javascript: ['\n\n', ';\n\n', '}\n\n'],
  typescript: ['\n\n', ';\n\n', '}\n\n'],
  typescriptreact: ['\n\n', ';\n\n', '}\n\n'],
  javascriptreact: ['\n\n', ';\n\n', '}\n\n'],
  python: ['\n\n\n', '\ndef ', '\nclass '],
  go: ['\n\n', '}\n\n', '\nfunc '],
  rust: ['\n\n', '}\n\n', '\nfn ', '\nimpl '],
  java: ['\n\n', '}\n\n'],
  cpp: ['\n\n', '}\n\n'],
  c: ['\n\n', '}\n\n'],
  ruby: ['\n\n', '\nend\n', '\ndef '],
  php: ['\n\n', '}\n\n', '\nfunction '],
  swift: ['\n\n', '}\n\n', '\nfunc '],
  kotlin: ['\n\n', '}\n\n', '\nfun '],
  default: ['\n\n\n'],
};

// ============ Defaults ============

export const DEFAULT_FIM_MODEL = FIMModel.QWEN_CODER_32B;
export const DEFAULT_MAX_TOKENS = 128;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_STOP_SEQUENCES = ['\n\n', '```'];

export function getFIMTokensForModel(model: string): FIMTokens {
  // Try exact match first
  if (MODEL_FIM_TOKENS[model]) return MODEL_FIM_TOKENS[model];

  // Try prefix match
  for (const [key, tokens] of Object.entries(MODEL_FIM_TOKENS)) {
    if (model.startsWith(key.split(':')[0])) return tokens;
  }

  // Default to Qwen format
  return QWEN_FIM_TOKENS;
}

export function getStopSequences(language: string, model: string): string[] {
  const langStops = LANGUAGE_STOP_SEQUENCES[language] || LANGUAGE_STOP_SEQUENCES.default;
  const tokens = getFIMTokensForModel(model);

  const modelStops = [tokens.endOfText];
  if (tokens.padding) modelStops.push(tokens.padding);
  if (tokens.middle) modelStops.push(tokens.middle);

  return [...new Set([...langStops, ...modelStops, ...DEFAULT_STOP_SEQUENCES])];
}
