import { PlanRequest } from './PlanningTypes';
import { AgentConfig } from '../AgentTypes';

const PLAN_OUTPUT_SCHEMA = `{
  "reasoning": "string — why this approach was chosen",
  "plan": {
    "description": "string — one-line summary of the plan",
    "steps": [
      {
        "id": "step_1",
        "type": "create|edit|delete|rename|move|terminal|test",
        "filePath": "relative/path/to/file",
        "targetPath": "relative/path (for rename/move only, null otherwise)",
        "description": "what this step does",
        "details": "specific instructions for execution",
        "dependencies": ["step_ids that must complete first"],
        "validation": "optional command to verify success",
        "rollback": "how to undo this step",
        "risk": "low|medium|high"
      }
    ],
    "affectedFiles": ["list of all file paths affected"],
    "estimatedComplexity": "low|medium|high|very-high",
    "warnings": ["potential issues to be aware of"],
    "testCommand": "command to run tests after all changes (null if none)"
  }
}`;

export class PlanningPromptBuilder {
  private static instance: PlanningPromptBuilder;

  static getInstance(): PlanningPromptBuilder {
    if (!PlanningPromptBuilder.instance) {
      PlanningPromptBuilder.instance = new PlanningPromptBuilder();
    }
    return PlanningPromptBuilder.instance;
  }

  buildPlanningPrompt(request: PlanRequest): { system: string; user: string } {
    const system = this.buildSystemPrompt(request.agentConfig);
    const user = this.buildUserPrompt(request);
    return { system, user };
  }

  private buildSystemPrompt(config: AgentConfig): string {
    return `You are INA Coding Agent, an expert software engineer that creates precise, executable plans for code changes.

## Your Role
You analyze user requests and produce structured JSON plans that describe exactly what file operations to perform. You do NOT write the actual code — you plan the operations.

## Rules
1. Analyze the request thoroughly before planning
2. Output ONLY valid JSON matching the schema below — no markdown, no prose outside JSON
3. List ALL files that will be affected (created, modified, deleted)
4. Break work into atomic, ordered steps — each step does ONE thing
5. Identify dependencies between steps (step_2 depends on step_1 if step_1 creates a file step_2 edits)
6. Flag risky operations (delete, rename that breaks imports, config changes)
7. Include validation steps where appropriate (run tests, type check)
8. Plan rollback strategy for each destructive step
9. Keep file paths relative to workspace root
10. Never plan operations outside the workspace

## Constraints
${this.buildConstraintsSection(config)}

## Output Schema
${PLAN_OUTPUT_SCHEMA}

## Examples
${this.buildExamplesSection()}

Respond with ONLY the JSON object. No explanation before or after.`;
  }

  private buildUserPrompt(request: PlanRequest): string {
    const parts: string[] = [];

    parts.push(`## User Request\n${request.prompt}`);

    const contextSection = this.buildContextSection(request);
    if (contextSection) {
      parts.push(`\n## Project Context\n${contextSection}`);
    }

    return parts.join('\n');
  }

  buildContextSection(request: PlanRequest): string {
    const parts: string[] = [];

    if (request.context.workspaceFiles && request.context.workspaceFiles.length > 0) {
      const tree = this.formatFileTree(request.context.workspaceFiles.slice(0, 50));
      parts.push(`### Workspace Structure\n\`\`\`\n${tree}\n\`\`\``);
    }

    if (request.context.currentFile && request.context.currentFileContent) {
      const content = this.formatFileContent(
        request.context.currentFile,
        request.context.currentFileContent,
        100
      );
      parts.push(`### Current File: ${request.context.currentFile}\n\`\`\`\n${content}\n\`\`\``);
    }

    if (request.context.selection) {
      parts.push(`### Selected Code\n\`\`\`\n${request.context.selection}\n\`\`\``);
    }

    if (request.context.mentions && request.context.mentions.length > 0) {
      const mentionList = request.context.mentions
        .map((m) => `- @${m.type}:${m.value}`)
        .join('\n');
      parts.push(`### Referenced\n${mentionList}`);
    }

    if (request.context.gitStatus) {
      parts.push(`### Git Status\n\`\`\`\n${request.context.gitStatus}\n\`\`\``);
    }

    return parts.join('\n\n');
  }

  buildConstraintsSection(config: AgentConfig): string {
    const constraints: string[] = [];
    constraints.push(`- Maximum ${config.maxSteps} steps per plan`);
    constraints.push(`- Maximum ${config.maxFiles} files affected per plan`);

    if (!config.allowDelete) constraints.push('- File deletion is NOT allowed');
    if (!config.allowTerminal) constraints.push('- Terminal commands are NOT allowed');
    if (!config.allowCreate) constraints.push('- File creation is NOT allowed');
    if (config.requireApproval) constraints.push('- All changes require user approval before execution');
    if (config.rollbackOnError) constraints.push('- Must include rollback strategy for each step');

    return constraints.join('\n');
  }

  buildExamplesSection(): string {
    return `### Example 1: "Add a login page"
\`\`\`json
{
  "reasoning": "Need to create a login component, add route, update navigation, and add styles",
  "plan": {
    "description": "Add login page with form, route, and navigation link",
    "steps": [
      {"id":"step_1","type":"create","filePath":"src/components/LoginPage.tsx","targetPath":null,"description":"Create LoginPage component with email/password form","details":"React component with useState for form fields, onSubmit handler","dependencies":[],"validation":null,"rollback":"Delete src/components/LoginPage.tsx","risk":"low"},
      {"id":"step_2","type":"edit","filePath":"src/App.tsx","targetPath":null,"description":"Add route for /login path","details":"Import LoginPage, add Route element in Routes","dependencies":["step_1"],"validation":null,"rollback":"Remove login route from App.tsx","risk":"low"},
      {"id":"step_3","type":"edit","filePath":"src/components/Navigation.tsx","targetPath":null,"description":"Add Login link to navigation","details":"Add NavLink to /login in nav menu","dependencies":["step_2"],"validation":null,"rollback":"Remove login NavLink","risk":"low"},
      {"id":"step_4","type":"test","filePath":"","targetPath":null,"description":"Run tests to verify","details":"npm test","dependencies":["step_3"],"validation":"npm test","rollback":null,"risk":"low"}
    ],
    "affectedFiles":["src/components/LoginPage.tsx","src/App.tsx","src/components/Navigation.tsx"],
    "estimatedComplexity":"medium",
    "warnings":["Ensure react-router-dom is installed"],
    "testCommand":"npm test"
  }
}
\`\`\`

### Example 2: "Rename the User model to Account"
\`\`\`json
{
  "reasoning": "Renaming requires updating the model file, all imports, type references, and tests",
  "plan": {
    "description": "Rename User model to Account across the codebase",
    "steps": [
      {"id":"step_1","type":"rename","filePath":"src/models/User.ts","targetPath":"src/models/Account.ts","description":"Rename model file","details":"Rename User.ts to Account.ts","dependencies":[],"validation":null,"rollback":"Rename back to User.ts","risk":"medium"},
      {"id":"step_2","type":"edit","filePath":"src/models/Account.ts","targetPath":null,"description":"Rename class/interface from User to Account","details":"Replace all User references with Account in the renamed file","dependencies":["step_1"],"validation":null,"rollback":"Revert class name","risk":"low"},
      {"id":"step_3","type":"edit","filePath":"src/services/authService.ts","targetPath":null,"description":"Update imports from User to Account","details":"Change import path and type references","dependencies":["step_2"],"validation":null,"rollback":"Revert import changes","risk":"medium"},
      {"id":"step_4","type":"test","filePath":"","targetPath":null,"description":"Run type check and tests","details":"npx tsc --noEmit && npm test","dependencies":["step_3"],"validation":"npx tsc --noEmit","rollback":null,"risk":"low"}
    ],
    "affectedFiles":["src/models/User.ts","src/models/Account.ts","src/services/authService.ts"],
    "estimatedComplexity":"medium",
    "warnings":["All files importing User must be updated","Database migration may be needed"],
    "testCommand":"npx tsc --noEmit && npm test"
  }
}
\`\`\``;
  }

  private formatFileTree(files: string[]): string {
    const sorted = [...files].sort();
    const lines: string[] = [];
    for (const file of sorted.slice(0, 40)) {
      const depth = file.split('/').length - 1;
      const indent = '  '.repeat(depth);
      const name = file.split('/').pop() || file;
      lines.push(`${indent}${name}`);
    }
    if (sorted.length > 40) {
      lines.push(`  ... (${sorted.length - 40} more files)`);
    }
    return lines.join('\n');
  }

  private formatFileContent(path: string, content: string, maxLines: number): string {
    const lines = content.split('\n');
    const truncated = lines.slice(0, maxLines);
    const numbered = truncated.map((l, i) => `${i + 1} | ${l}`);
    if (lines.length > maxLines) {
      numbered.push(`... (${lines.length - maxLines} more lines)`);
    }
    return numbered.join('\n');
  }
}
