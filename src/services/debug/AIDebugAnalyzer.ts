/**
 * AIDebugAnalyzer.ts — Phase 19 Step 19.1
 * Sends structured debug context to INA-7 Pro for root cause analysis
 */

import { DebugContext, DiagnosticResult, Fix, SuggestedBreakpoint, DebugAnalysisEvent } from './DebugTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class AIDebugAnalyzer {
  private cache = new Map<string, DiagnosticResult>();
  private apiEndpoint: string;
  private onEvent?: (event: DebugAnalysisEvent) => void;

  constructor(onEvent?: (event: DebugAnalysisEvent) => void) {
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
    this.onEvent = onEvent;
  }

  async analyze(context: DebugContext, authHeaders: Record<string, string>): Promise<DiagnosticResult> {
    const cacheKey = this.computeCacheKey(context);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    this.emit({ type: 'analyzing', progress: 0.3, message: 'INA-7 Pro analyzing error...' });

    const prompt = this.buildPrompt(context);

    try {
      const resp = await fetch(`${this.apiEndpoint}/api/debug/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt, error: { type: context.error.type, message: context.error.message, language: context.error.language } }),
      });

      if (!resp.ok) throw new Error(`API error: ${resp.status}`);

      const data = await resp.json();
      const result = this.parseResponse(data.analysis || data);

      this.cache.set(cacheKey, result);
      this.emit({ type: 'complete', progress: 1.0, result });
      return result;
    } catch (e: any) {
      Logger.error('[AIDebugAnalyzer] Analysis failed:', e);
      this.emit({ type: 'error', progress: 0, message: e.message });
      return this.fallbackResult(context);
    }
  }

  private buildPrompt(context: DebugContext): string {
    const sections: string[] = [];

    sections.push(`## Error\nType: ${context.error.type}\nMessage: ${context.error.message}\nLanguage: ${context.error.language}`);

    if (context.error.stackFrames.length > 0) {
      const trace = context.error.stackFrames
        .slice(0, 10)
        .map((f, i) => `  ${i}. ${f.functionName} at ${f.file}:${f.line}${f.isUserCode ? '' : ' (external)'}`)
        .join('\n');
      sections.push(`## Stack Trace\n${trace}`);
    }

    for (const [key, { code }] of context.surroundingCode) {
      sections.push(`## Code at ${key}\n\`\`\`\n${code}\n\`\`\``);
    }

    for (const [key, blameEntries] of context.gitBlame) {
      const blame = blameEntries.map(b => `  L${b.line}: ${b.author} (${b.date}) ${b.commit}`).join('\n');
      sections.push(`## Git Blame for ${key}\n${blame}`);
    }

    if (context.recentChanges) {
      sections.push(`## Recent Changes (last 3 commits)\n\`\`\`diff\n${context.recentChanges.slice(0, 2000)}\n\`\`\``);
    }

    sections.push(`## Task
Analyze this error and respond in JSON:
{
  "rootCause": "exact root cause",
  "explanation": "detailed explanation",
  "suggestedFixes": [{ "description": "...", "file": "...", "diff": "unified diff", "risk": "low|medium|high", "breakingChange": false }],
  "confidence": 0-100,
  "relatedFiles": ["..."],
  "breakpoints": [{ "file": "...", "line": 0, "condition": "optional", "logMessage": "optional", "reason": "..." }]
}`);

    return sections.join('\n\n');
  }

  private parseResponse(data: any): DiagnosticResult {
    // If already structured
    if (data.rootCause && data.suggestedFixes) {
      return {
        rootCause: data.rootCause,
        explanation: data.explanation || data.rootCause,
        suggestedFixes: (data.suggestedFixes || []).map((f: any) => ({
          description: f.description || '',
          file: f.file || '',
          diff: f.diff || '',
          risk: (['low', 'medium', 'high'].includes(f.risk) ? f.risk : 'medium') as Fix['risk'],
          breakingChange: !!f.breakingChange,
        })),
        confidence: typeof data.confidence === 'number' ? data.confidence : 50,
        relatedFiles: data.relatedFiles || [],
        breakpoints: data.breakpoints || [],
      };
    }

    // Try to parse as string containing JSON
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const jsonMatch = text.match(/\{[\s\S]*"rootCause"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return this.parseResponse(JSON.parse(jsonMatch[0]));
      } catch { /* fall through */ }
    }

    // Regex fallback
    const rootCauseMatch = text.match(/root\s*cause[:\s]*(.+?)(?:\n|$)/i);
    return {
      rootCause: rootCauseMatch?.[1]?.trim() || 'Unable to determine root cause',
      explanation: text.slice(0, 500),
      suggestedFixes: [],
      confidence: 20,
      relatedFiles: [],
    };
  }

  private fallbackResult(context: DebugContext): DiagnosticResult {
    const firstUserFrame = context.error.stackFrames.find(f => f.isUserCode);
    return {
      rootCause: `${context.error.type}: ${context.error.message}`,
      explanation: `Error occurred${firstUserFrame ? ` at ${firstUserFrame.file}:${firstUserFrame.line} in ${firstUserFrame.functionName}` : ''}. Server analysis unavailable.`,
      suggestedFixes: [],
      confidence: 10,
      relatedFiles: firstUserFrame ? [firstUserFrame.file] : [],
    };
  }

  private computeCacheKey(context: DebugContext): string {
    return `${context.error.type}:${context.error.message}:${context.error.stackFrames.slice(0, 3).map(f => `${f.file}:${f.line}`).join(',')}`;
  }

  private emit(event: DebugAnalysisEvent): void {
    this.onEvent?.(event);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
