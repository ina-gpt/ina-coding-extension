import * as fs from 'fs';
import * as path from 'path';
import { RulesTemplate } from './RulesTypes';

export class RulesTemplateService {
  private static instance: RulesTemplateService;

  static getInstance(): RulesTemplateService {
    if (!RulesTemplateService.instance) {
      RulesTemplateService.instance = new RulesTemplateService();
    }
    return RulesTemplateService.instance;
  }

  getTemplates(): RulesTemplate[] {
    return TEMPLATES;
  }

  getTemplate(name: string): RulesTemplate | null {
    return TEMPLATES.find(t => t.name === name) || null;
  }

  generateFromTemplate(templateName: string, customizations?: Record<string, string>): string {
    const template = this.getTemplate(templateName);
    if (!template) return '';
    let content = template.content;
    if (customizations) {
      for (const [key, value] of Object.entries(customizations)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }
    content = content.replace(/\{\{\w+\}\}/g, 'MyProject');
    return content;
  }

  async detectBestTemplate(workspaceRoot: string): Promise<string> {
    if (fs.existsSync(path.join(workspaceRoot, 'next.config.js')) || fs.existsSync(path.join(workspaceRoot, 'next.config.mjs')) || fs.existsSync(path.join(workspaceRoot, 'next.config.ts'))) return 'next-typescript';
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) return 'next-typescript';
        if (deps.react) return 'react-typescript';
        if (deps.express) return 'node-express';
      } catch { /* ignore */ }
    }
    if (fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) return 'python-fastapi';
    if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) return 'go';
    if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) return 'rust';
    return 'minimal';
  }
}

const TEMPLATES: RulesTemplate[] = [
  {
    name: 'next-typescript', description: 'Next.js + TypeScript + Tailwind', language: 'typescript', framework: 'next.js',
    content: `---\nproject: {{projectName}}\nlanguage: typescript\nframework: next.js\n---\n\n# Tech Stack\n- Next.js 15 with App Router\n- TypeScript with strict mode\n- Tailwind CSS for styling\n- Prisma for database ORM\n\n# Architecture\n- Use App Router (app/ directory) with server components by default\n- Client components only when using hooks — add 'use client' directive\n- API routes in app/api/ using Route Handlers\n- Shared components in components/\n- Utility functions in lib/\n\n# Coding Style\n- Functional components only — no class components\n- Use arrow functions for components\n- Always add explicit return types to functions\n- Use 'const' by default, 'let' only when reassignment needed\n- Destructure props in function parameters\n\n# Naming\n- PascalCase for components and types\n- camelCase for functions and variables\n- UPPER_SNAKE_CASE for constants\n- kebab-case for file names\n\n# Do\n- Write unit tests for business logic\n- Use error boundaries for component error handling\n- Add loading and error states to async components\n- Use Zod for runtime validation\n- Add aria attributes for accessibility\n\n# Don't\n- Don't use 'any' type — use 'unknown' and narrow\n- Don't mutate state directly\n- Don't use nested ternaries\n- Don't ignore TypeScript errors with @ts-ignore\n- Don't store secrets in code\n- Don't fetch data in useEffect for initial data — use server components\n\n# Error Handling\n- Always catch errors in async functions\n- Return typed error responses from API routes\n- Log errors with context\n\n# Git\n- Use conventional commits: feat:, fix:, chore:, docs:\n- Keep commits focused\n`,
  },
  {
    name: 'react-typescript', description: 'React + TypeScript (Vite/CRA)', language: 'typescript', framework: 'react',
    content: `---\nproject: {{projectName}}\nlanguage: typescript\nframework: react\n---\n\n# Tech Stack\n- React 18+ with TypeScript\n- Vite for build tooling\n- React Router for routing\n- Tailwind CSS\n\n# Coding Style\n- Functional components with hooks\n- Use const for components\n- Add explicit return types\n- Prefer named exports\n\n# Do\n- Use React.memo for expensive components\n- Use custom hooks for shared logic\n- Write tests with Vitest/Jest\n\n# Don't\n- Don't use class components\n- Don't use any type\n- Don't mutate state directly\n`,
  },
  {
    name: 'python-fastapi', description: 'Python + FastAPI', language: 'python', framework: 'fastapi',
    content: `---\nproject: {{projectName}}\nlanguage: python\nframework: fastapi\n---\n\n# Tech Stack\n- Python 3.11+\n- FastAPI with async/await\n- SQLAlchemy 2.0 with async\n- Pydantic v2 for validation\n- Alembic for migrations\n\n# Coding Style\n- Use type hints everywhere\n- Use async def for all route handlers\n- Follow PEP 8\n\n# Architecture\n- Routers in app/routers/\n- Models in app/models/\n- Schemas in app/schemas/\n- Services in app/services/\n\n# Do\n- Use Pydantic models for request/response schemas\n- Write tests with pytest\n- Use HTTPException for error responses\n\n# Don't\n- Don't use raw SQL without parameterized queries\n- Don't catch broad Exception without re-raising\n- Don't use mutable default arguments\n`,
  },
  {
    name: 'node-express', description: 'Node.js + Express', language: 'typescript', framework: 'express',
    content: `---\nproject: {{projectName}}\nlanguage: typescript\nframework: express\n---\n\n# Tech Stack\n- Node.js 20+ with TypeScript\n- Express.js\n- Prisma ORM\n\n# Do\n- Use async/await for all async operations\n- Validate input with Zod\n- Use middleware for cross-cutting concerns\n\n# Don't\n- Don't use callbacks — use promises\n- Don't expose stack traces in production\n`,
  },
  {
    name: 'go', description: 'Go', language: 'go', framework: null,
    content: `---\nproject: {{projectName}}\nlanguage: go\n---\n\n# Coding Style\n- Follow Effective Go guidelines\n- Use gofmt for formatting\n- Short variable names in small scopes\n\n# Do\n- Always handle errors — never use _\n- Use interfaces for dependencies\n- Write table-driven tests\n\n# Don't\n- Don't use init() unless absolutely necessary\n- Don't use global variables\n- Don't panic in library code\n`,
  },
  {
    name: 'rust', description: 'Rust', language: 'rust', framework: null,
    content: `---\nproject: {{projectName}}\nlanguage: rust\n---\n\n# Coding Style\n- Use rustfmt for formatting\n- Prefer Result over panic\n- Use clippy lints\n\n# Do\n- Use proper error types with thiserror\n- Write documentation comments with examples\n- Use iterators over manual loops\n\n# Don't\n- Don't use unwrap in production code\n- Don't use unsafe without justification\n- Don't ignore compiler warnings\n`,
  },
  {
    name: 'minimal', description: 'Minimal language-agnostic rules', language: null, framework: null,
    content: `# Project Rules\n\n## Do\n- Follow existing patterns in the codebase\n- Write meaningful names\n- Handle errors gracefully\n- Add comments for complex logic\n\n## Don't\n- Don't leave TODO comments without ticket references\n- Don't use magic numbers\n- Don't ignore linting warnings\n- Don't commit commented-out code\n`,
  },
];
