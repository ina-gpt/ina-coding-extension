import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki';

interface HighlightResult { html: string; language: string; }

const LANG_MAP: Record<string, string> = {
  js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', py: 'python',
  rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash', yml: 'yaml', yaml: 'yaml',
  json: 'json', xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  less: 'less', md: 'markdown', markdown: 'markdown', vue: 'vue', svelte: 'svelte',
  dockerfile: 'dockerfile', docker: 'dockerfile', makefile: 'makefile', sql: 'sql',
  graphql: 'graphql', gql: 'graphql', toml: 'toml', ini: 'ini', diff: 'diff',
  text: 'text', txt: 'text', plain: 'text', plaintext: 'text',
};

const PLAINTEXT_LANGS = new Set(['text', 'plaintext', 'plain', 'txt']);

const PRELOAD: BundledLanguage[] = [
  'javascript', 'typescript', 'jsx', 'tsx', 'python', 'rust', 'go', 'java',
  'json', 'yaml', 'bash', 'html', 'css', 'markdown', 'sql',
];

class HighlighterService {
  private hl: Highlighter | null = null;
  private initPromise: Promise<void> | null = null;
  private loaded = new Set<string>();

  async init(): Promise<void> {
    if (this.hl) { return; }
    if (this.initPromise) { return this.initPromise; }
    this.initPromise = (async () => {
      this.hl = await createHighlighter({ themes: ['github-dark', 'github-light'], langs: PRELOAD });
      PRELOAD.forEach(l => this.loaded.add(l));
    })();
    return this.initPromise;
  }

  private normLang(lang: string): BundledLanguage {
    const n = lang.toLowerCase().trim();
    return (LANG_MAP[n] || n) as BundledLanguage;
  }

  private async ensureLang(lang: BundledLanguage): Promise<boolean> {
    if (!this.hl || this.loaded.has(lang)) { return !!this.hl; }
    try { await this.hl.loadLanguage(lang); this.loaded.add(lang); return true; }
    catch { return false; }
  }

  async highlight(code: string, language: string): Promise<HighlightResult> {
    await this.init();
    if (!this.hl) { return this.fallback(code, language); }
    const lang = this.normLang(language);
    if (PLAINTEXT_LANGS.has(lang) || !language.trim()) { return this.fallback(code, language || 'text'); }
    const ok = await this.ensureLang(lang);
    if (!ok) { return this.fallback(code, language); }
    try {
      return { html: this.hl.codeToHtml(code, { lang, theme: 'github-dark' }), language: lang };
    } catch { return this.fallback(code, language); }
  }

  private fallback(code: string, language: string): HighlightResult {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { html: `<pre class="shiki"><code>${escaped}</code></pre>`, language: language || 'plaintext' };
  }
}

export const highlighterService = new HighlighterService();
highlighterService.init().catch(console.error);
