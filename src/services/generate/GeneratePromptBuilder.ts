/**
 * Phase 15.1 — Generate Prompt Builder
 */
import { GenerateRequest, GenerateMode } from './GenerateTypes';
import { Logger } from '../../utils/Logger';

export class GeneratePromptBuilder {
  private static instance: GeneratePromptBuilder;
  private constructor() {}
  static getInstance(): GeneratePromptBuilder {
    if (!GeneratePromptBuilder.instance) GeneratePromptBuilder.instance = new GeneratePromptBuilder();
    return GeneratePromptBuilder.instance;
  }

  buildSystemPrompt(request: GenerateRequest, rules: string | null): string {
    const ctx = request.context;
    let prompt = `You are a code generator. Generate ONLY the requested code.
Rules:
- Output ONLY code, no explanations, no markdown fences
- Follow the existing code style in the file
- Match indentation level of the cursor position
- Use existing imports where possible
- If new imports are needed, prefix them on the first lines with "// IMPORTS:"
${rules ? `\nProject rules:\n${rules}` : ''}

Context:
Language: ${ctx.language}
Current scope: ${ctx.currentScope?.type || 'file'} ${ctx.currentScope?.name || ''}
${ctx.currentScope?.existingMembers.length ? `Existing members: ${ctx.currentScope.existingMembers.join(', ')}` : ''}
${ctx.nearbySymbols.length ? `Nearby symbols: ${ctx.nearbySymbols.map(s => `${s.kind}:${s.name}`).join(', ')}` : ''}
${ctx.imports.length ? `Existing imports: ${ctx.imports.slice(0, 10).join('; ')}` : ''}
Cursor at line ${ctx.cursorLine}, column ${ctx.cursorColumn}`;
    return prompt;
  }

  buildUserPrompt(request: GenerateRequest): string {
    const ctx = request.context;
    const prefixLines = ctx.prefix.split('\n').slice(-100).join('\n');
    const suffixLines = ctx.suffix.split('\n').slice(0, 50).join('\n');
    let modeInstruction = '';
    switch (ctx.mode) {
      case GenerateMode.COMPLETE_FUNCTION: modeInstruction = 'Complete the function body based on the signature and context.'; break;
      case GenerateMode.IMPLEMENT_INTERFACE: modeInstruction = 'Implement all methods from the interface with proper types and logic.'; break;
      case GenerateMode.ADD_METHOD: modeInstruction = `Add a method to the ${ctx.currentScope?.name || 'class'}: ${request.prompt}`; break;
      default: modeInstruction = request.prompt; break;
    }
    return `Code before cursor:\n${prefixLines}\n█ ← cursor is here\n${suffixLines}\n\nGenerate: ${modeInstruction}`;
  }
}
