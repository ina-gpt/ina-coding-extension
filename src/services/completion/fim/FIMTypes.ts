// ============ Fill-in-the-middle token profiles ============
//
// WHAT CHANGED
//   This file used to carry a `FIMModel` enum of upstream model ids, four token
//   tables named after the model families that use them, and a `Record` keying
//   thirteen upstream ids onto those tables. Twenty-five of the repository's
//   raw-identifier findings lived here — the single largest concentration.
//
// WHY A PROFILE AND NOT A MODEL MAP
//   FIM sentinel tokens are a property of the model the SERVER loads, not of
//   anything the client can see. The client's only legitimate need is to know
//   WHICH token shape to wrap a prompt in, and that is one bit of information
//   the server can state directly. A client-side table mapping upstream ids to
//   token shapes is a copy of the server's model roster, kept in a public
//   repository, that goes stale silently the moment the server changes.
//
// WHAT WAS REMOVED, AND WHY THAT IS NOT A REGRESSION
//   Three of the four profiles were unreachable. Every model in the INA
//   registry uses the sentinel-pipe shape below, and the offline path builds
//   its own prompt with those same sentinels hardcoded. No configuration
//   reachable from this extension could select the other three.

export interface FIMTokens {
  prefix: string;
  suffix: string;
  middle: string;
  endOfText: string;
  padding: string | null;
  repository: string | null;
  file: string | null;
}

/**
 * The default sentinel shape, named for its SYNTAX rather than for a vendor.
 *
 * Every model in the INA registry accepts this form. It is the fallback when
 * the server has not declared a profile, which is the common case: the profile
 * only needs to travel when it differs.
 */
export const FIM_PROFILE_DEFAULT: FIMTokens = {
  prefix: '<|fim_prefix|>',
  suffix: '<|fim_suffix|>',
  middle: '<|fim_middle|>',
  endOfText: '<|endoftext|>',
  padding: '<|fim_pad|>',
  repository: '<|repo_name|>',
  file: '<|file_sep|>',
};

/**
 * The profile in force, replaceable by the server capability response.
 *
 * Held in a module-level cell rather than threaded through every call site
 * because it is genuinely global: one server, one loaded model family, one
 * token shape per session.
 */
let activeProfile: FIMTokens = FIM_PROFILE_DEFAULT;

/**
 * Adopt a server-declared token profile.
 *
 * Every field is validated before it is adopted. A partially-populated profile
 * is REJECTED rather than merged into the default: a prompt built from half of
 * one sentinel scheme and half of another produces a completion that looks
 * plausible and is silently wrong, which is far worse than using the default.
 */
export function setFIMProfile(profile: Partial<FIMTokens> | null | undefined): boolean {
  if (!profile) return false;
  const required: (keyof FIMTokens)[] = ['prefix', 'suffix', 'middle', 'endOfText'];
  for (const k of required) {
    const v = profile[k];
    if (typeof v !== 'string' || v.length === 0) return false;
  }
  activeProfile = {
    prefix: profile.prefix as string,
    suffix: profile.suffix as string,
    middle: profile.middle as string,
    endOfText: profile.endOfText as string,
    padding: typeof profile.padding === 'string' ? profile.padding : null,
    repository: typeof profile.repository === 'string' ? profile.repository : null,
    file: typeof profile.file === 'string' ? profile.file : null,
  };
  return true;
}

/** Restore the built-in profile. */
export function resetFIMProfile(): void {
  activeProfile = FIM_PROFILE_DEFAULT;
}

/**
 * The token shape to use.
 *
 * Takes no model argument by design. The previous signature,
 * `getFIMTokensForModel(model)`, invited every caller to hold an upstream id in
 * order to ask a question whose answer never depended on it.
 */
export function getFIMTokens(): FIMTokens {
  return activeProfile;
}

// ============ FIM Request/Response ============

export interface FIMRequest {
  id: string;
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  /** An INA model id — see src/config/model-registry.ts. */
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
  /** An INA model id. */
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

export const DEFAULT_MAX_TOKENS = 128;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_STOP_SEQUENCES = ['\n\n', '```'];

export function getStopSequences(language: string): string[] {
  const langStops = LANGUAGE_STOP_SEQUENCES[language] || LANGUAGE_STOP_SEQUENCES.default;
  const tokens = getFIMTokens();

  const modelStops = [tokens.endOfText];
  if (tokens.padding) modelStops.push(tokens.padding);
  if (tokens.middle) modelStops.push(tokens.middle);

  return [...new Set([...langStops, ...modelStops, ...DEFAULT_STOP_SEQUENCES])];
}
