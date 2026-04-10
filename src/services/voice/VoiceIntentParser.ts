/**
 * VoiceIntentParser.ts — Phase 20 Step 20.2
 * Parse voice transcripts into actionable intents
 */

import { VoiceCommand, VoiceIntent, VoiceIntentType } from './VoiceTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

interface IntentRule {
  patterns: RegExp[];
  type: VoiceIntentType;
  extract: (match: RegExpMatchArray, transcript: string) => Record<string, any>;
}

const RULES: IntentRule[] = [
  // Write code
  { patterns: [/(?:write|create|make|generate|add)\s+(?:a\s+)?(?:function|method|class|component|hook)\s+(?:that\s+|called\s+|named\s+)?(.+)/i, /(?:erstelle|schreibe|erzeuge)\s+(?:eine?\s+)?(?:Funktion|Methode|Klasse|Komponente)\s+(.+)/i],
    type: VoiceIntentType.WRITE_CODE, extract: (m) => ({ description: m[1] }) },
  // Go to file
  { patterns: [/(?:go to|open|switch to)\s+(?:file\s+)?(.+)/i, /(?:öffne|gehe zu)\s+(?:Datei\s+)?(.+)/i],
    type: VoiceIntentType.GO_TO_FILE, extract: (m) => ({ filename: m[1].trim() }) },
  // Go to function
  { patterns: [/(?:go to|find|jump to)\s+(?:function|method|def)\s+(\w+)/i, /(?:gehe zu|finde)\s+(?:Funktion|Methode)\s+(\w+)/i],
    type: VoiceIntentType.GO_TO_FUNCTION, extract: (m) => ({ functionName: m[1] }) },
  // Edit line
  { patterns: [/(?:on|at)\s+line\s+(\d+)\s*,?\s*(?:change|replace)\s+(.+?)\s+(?:to|with)\s+(.+)/i, /(?:in|auf)\s+Zeile\s+(\d+)\s*,?\s*(?:ändere|ersetze)\s+(.+?)\s+(?:zu|mit|durch)\s+(.+)/i],
    type: VoiceIntentType.EDIT_LINE, extract: (m) => ({ line: parseInt(m[1], 10), from: m[2], to: m[3] }) },
  // Run command
  { patterns: [/(?:run|execute)\s+(?:the\s+)?(.+)/i, /(?:führe aus|starte)\s+(.+)/i],
    type: VoiceIntentType.RUN_COMMAND, extract: (m) => ({ command: m[1].trim() }) },
  // Explain
  { patterns: [/(?:explain|what does|what is)\s+(.+)/i, /(?:erkläre|was ist|was macht)\s+(.+)/i],
    type: VoiceIntentType.EXPLAIN_CODE, extract: (m) => ({ query: m[1] }) },
  // Fix error
  { patterns: [/(?:fix|solve|debug|repair)\s+(?:this|the)?\s*(?:error|bug|issue|problem)/i, /(?:behebe|repariere|löse)\s+(?:den|diesen)?\s*(?:Fehler|Bug)/i],
    type: VoiceIntentType.FIX_ERROR, extract: () => ({}) },
  // Generate test
  { patterns: [/(?:generate|create|write)\s+(?:a\s+)?tests?\s+(?:for\s+)?(.+)?/i, /(?:generiere|erstelle|schreibe)\s+(?:einen?\s+)?Tests?\s+(?:für\s+)?(.+)?/i],
    type: VoiceIntentType.GENERATE_TEST, extract: (m) => ({ target: m[1]?.trim() || 'current file' }) },
  // Rename
  { patterns: [/rename\s+(\w+)\s+to\s+(\w+)/i, /benenne\s+(\w+)\s+um\s+(?:in|zu)\s+(\w+)/i],
    type: VoiceIntentType.RENAME_VARIABLE, extract: (m) => ({ from: m[1], to: m[2] }) },
  // Delete lines
  { patterns: [/(?:delete|remove)\s+lines?\s+(\d+)\s*(?:to|through|-)\s*(\d+)/i, /(?:lösche|entferne)\s+Zeilen?\s+(\d+)\s*(?:bis|-)\s*(\d+)/i],
    type: VoiceIntentType.DELETE_LINES, extract: (m) => ({ startLine: parseInt(m[1], 10), endLine: parseInt(m[2], 10) }) },
  // Undo / Redo
  { patterns: [/\bundo\b/i, /\brückgängig\b/i], type: VoiceIntentType.UNDO, extract: () => ({}) },
  { patterns: [/\bredo\b/i, /\bwiederherstellen\b/i], type: VoiceIntentType.REDO, extract: () => ({}) },
  // Comment
  { patterns: [/(?:add|write|dictate)\s+(?:a\s+)?comment\s*:?\s*(.+)/i, /(?:füge|schreibe)\s+(?:einen?\s+)?Kommentar\s+(?:hinzu)?\s*:?\s*(.+)/i],
    type: VoiceIntentType.DICTATE_COMMENT, extract: (m) => ({ comment: m[1] }) },
  // Ask question (catch-all for "ask" patterns)
  { patterns: [/(?:ask|question|hey ina)\s*:?\s*(.+)/i, /(?:frage|hey ina)\s*:?\s*(.+)/i],
    type: VoiceIntentType.ASK_QUESTION, extract: (m) => ({ question: m[1] }) },
];

export class VoiceIntentParser {
  parse(command: VoiceCommand): VoiceIntent {
    const transcript = command.transcript.trim();
    if (!transcript) return { type: VoiceIntentType.UNKNOWN, parsed: {}, rawTranscript: transcript, confidence: 0 };

    // Try rule-based parsing
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        const match = transcript.match(pattern);
        if (match) {
          return {
            type: rule.type,
            parsed: rule.extract(match, transcript),
            rawTranscript: transcript,
            confidence: command.confidence * 0.9,
          };
        }
      }
    }

    // Fallback: treat as question/chat
    return {
      type: VoiceIntentType.ASK_QUESTION,
      parsed: { question: transcript },
      rawTranscript: transcript,
      confidence: command.confidence * 0.5,
    };
  }
}
