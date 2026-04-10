/**
 * AutoFormatTypes.ts
 * Phase 16.6 — Auto-format code after AI applies changes
 */

export interface FormatterConfig {
  name: string;
  /** Shell command to invoke (e.g. 'npx', 'prettier', 'gofmt') */
  command: string;
  /** Args to pass; the file path is appended automatically */
  args: string[];
  /** Lowercase file extensions (no dot) handled by this formatter */
  fileExtensions: string[];
  /** Config files whose presence in workspace root activates this formatter */
  configFiles: string[];
  /**
   * Optional: substring that must be present in one of the configFiles to activate.
   * Used for tools that share a config file with other tools (e.g. black in pyproject.toml).
   */
  checkContent?: string;
  /** True if this formatter supports range formatting */
  supportsRange: boolean;
}

export interface FormatterResult {
  success: boolean;
  /** New content after formatting (may be unchanged) */
  formattedContent: string | null;
  /** True if any byte changed */
  changesApplied: boolean;
  /** Display name of the formatter that ran */
  formatterUsed: string;
  error: string | null;
  /** Time taken in ms */
  durationMs: number;
}

/** Catalog of known formatters in priority order */
export const KNOWN_FORMATTERS: FormatterConfig[] = [
  {
    name: 'prettier',
    command: 'npx',
    args: ['--no-install', 'prettier', '--write'],
    fileExtensions: ['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'html', 'json', 'md', 'yaml', 'yml'],
    configFiles: [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.js',
      '.prettierrc.yaml',
      '.prettierrc.yml',
      'prettier.config.js',
      'prettier.config.cjs',
    ],
    supportsRange: true,
  },
  {
    name: 'eslint',
    command: 'npx',
    args: ['--no-install', 'eslint', '--fix'],
    fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    configFiles: [
      '.eslintrc',
      '.eslintrc.json',
      '.eslintrc.js',
      '.eslintrc.cjs',
      'eslint.config.js',
      'eslint.config.mjs',
    ],
    supportsRange: false,
  },
  {
    name: 'black',
    command: 'black',
    args: ['--quiet'],
    fileExtensions: ['py'],
    configFiles: ['pyproject.toml'],
    checkContent: '[tool.black]',
    supportsRange: false,
  },
  {
    name: 'ruff',
    command: 'ruff',
    args: ['format'],
    fileExtensions: ['py'],
    configFiles: ['pyproject.toml', 'ruff.toml', '.ruff.toml'],
    checkContent: '[tool.ruff',
    supportsRange: false,
  },
  {
    name: 'gofmt',
    command: 'gofmt',
    args: ['-w'],
    fileExtensions: ['go'],
    configFiles: ['go.mod'],
    supportsRange: false,
  },
  {
    name: 'rustfmt',
    command: 'rustfmt',
    args: [],
    fileExtensions: ['rs'],
    configFiles: ['rustfmt.toml', '.rustfmt.toml', 'Cargo.toml'],
    supportsRange: false,
  },
  {
    name: 'deno',
    command: 'deno',
    args: ['fmt'],
    fileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'md'],
    configFiles: ['deno.json', 'deno.jsonc'],
    supportsRange: false,
  },
];

export interface AutoFormatOptions {
  /** Run after AI chat code apply */
  onApply: boolean;
  /** Run after agent step file write */
  onAgentStep: boolean;
  /** Run after Cmd+K inline edit */
  onInlineEdit: boolean;
}

export const DEFAULT_AUTOFORMAT_OPTIONS: AutoFormatOptions = {
  onApply: true,
  onAgentStep: true,
  onInlineEdit: true,
};
