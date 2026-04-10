/**
 * BreakpointAdvisor.ts — Phase 19 Step 19.1
 * Suggests and sets strategic breakpoints based on error analysis
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosticResult, SuggestedBreakpoint } from './DebugTypes';
import { Logger } from '../../utils/Logger';

export class BreakpointAdvisor {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  suggestBreakpoints(result: DiagnosticResult): SuggestedBreakpoint[] {
    const bps: SuggestedBreakpoint[] = [];

    // From explicit analysis breakpoints
    if (result.breakpoints) {
      bps.push(...result.breakpoints);
    }

    // From fixes — set breakpoint at fix locations for verification
    for (const fix of result.suggestedFixes) {
      const lineMatch = fix.diff.match(/^[-+].*$/m);
      const lineNumMatch = fix.diff.match(/@@ -(\d+)/);
      if (fix.file && lineNumMatch) {
        bps.push({
          file: fix.file,
          line: parseInt(lineNumMatch[1], 10),
          reason: `Verify fix: ${fix.description.slice(0, 60)}`,
        });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return bps.filter(bp => {
      const key = `${bp.file}:${bp.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async applyBreakpoints(breakpoints: SuggestedBreakpoint[]): Promise<number> {
    let added = 0;

    for (const bp of breakpoints) {
      try {
        const absPath = path.isAbsolute(bp.file)
          ? bp.file
          : path.join(this.workspaceRoot, bp.file);
        const uri = vscode.Uri.file(absPath);
        const location = new vscode.Location(uri, new vscode.Position(bp.line - 1, 0));

        if (bp.logMessage) {
          // Logpoint
          const logBp = new vscode.SourceBreakpoint(location, true, undefined, undefined, bp.logMessage);
          vscode.debug.addBreakpoints([logBp]);
        } else if (bp.condition) {
          // Conditional breakpoint
          const condBp = new vscode.SourceBreakpoint(location, true, bp.condition);
          vscode.debug.addBreakpoints([condBp]);
        } else {
          // Standard breakpoint
          const stdBp = new vscode.SourceBreakpoint(location, true);
          vscode.debug.addBreakpoints([stdBp]);
        }
        added++;
      } catch (e) {
        Logger.warn(`[BreakpointAdvisor] Failed to set breakpoint at ${bp.file}:${bp.line}`, e);
      }
    }

    return added;
  }

  async clearSuggestedBreakpoints(): Promise<void> {
    // Remove all breakpoints (user can undo with VS Code breakpoint UI)
    // Only clear if user confirms
    const bps = vscode.debug.breakpoints;
    if (bps.length > 0) {
      vscode.debug.removeBreakpoints(bps);
    }
  }
}
