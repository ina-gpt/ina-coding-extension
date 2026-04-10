/**
 * RelationAnalyzer.ts — Phase 19 Step 19.4
 * Analyze relationships between code entities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CodeEntity, CodeRelation, RelationType } from './KnowledgeTypes';
import { Logger } from '../../utils/Logger';

export class RelationAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  analyze(entities: CodeEntity[], files: string[]): CodeRelation[] {
    const relations: CodeRelation[] = [];
    const entityByName = new Map<string, CodeEntity>();
    const entityByFile = new Map<string, CodeEntity[]>();

    for (const e of entities) {
      if (e.type !== 'file') entityByName.set(e.name, e);
      const fileEntities = entityByFile.get(e.filePath) || [];
      fileEntities.push(e);
      entityByFile.set(e.filePath, fileEntities);
    }

    for (const file of files) {
      const absPath = path.isAbsolute(file) ? file : path.join(this.workspaceRoot, file);
      let content: string;
      try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }
      const relPath = path.relative(this.workspaceRoot, absPath);

      // Import relations
      relations.push(...this.analyzeImports(content, relPath, entities));

      // Inheritance relations
      relations.push(...this.analyzeInheritance(content, relPath, entityByName));

      // Call relations
      relations.push(...this.analyzeCalls(content, relPath, entityByName, entityByFile));

      // Test relations
      relations.push(...this.analyzeTestRelations(relPath, entityByFile));
    }

    return this.deduplicateRelations(relations);
  }

  private analyzeImports(content: string, file: string, entities: CodeEntity[]): CodeRelation[] {
    const relations: CodeRelation[] = [];
    const importRegex = /import\s+(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /(?:const|let|var)\s+(?:{[^}]+}|\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;

    const sourceFile = entities.find(e => e.type === 'file' && e.filePath === file);
    if (!sourceFile) return relations;

    for (const regex of [importRegex, requireRegex]) {
      let m;
      while ((m = regex.exec(content)) !== null) {
        const importPath = m[1];
        if (importPath.startsWith('.')) {
          const resolvedPath = this.resolveImportPath(file, importPath);
          const targetFile = entities.find(e => e.type === 'file' && e.filePath === resolvedPath);
          if (targetFile) {
            relations.push(this.makeRelation(sourceFile.id, targetFile.id, 'imports'));
          }
        }
      }
    }

    return relations;
  }

  private analyzeInheritance(content: string, file: string, entityByName: Map<string, CodeEntity>): CodeRelation[] {
    const relations: CodeRelation[] = [];

    // extends
    const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g;
    let m;
    while ((m = extendsRegex.exec(content)) !== null) {
      const child = entityByName.get(m[1]);
      const parent = entityByName.get(m[2]);
      if (child && parent) relations.push(this.makeRelation(child.id, parent.id, 'extends'));
    }

    // implements
    const implementsRegex = /class\s+(\w+)(?:\s+extends\s+\w+)?\s+implements\s+([\w,\s]+)/g;
    while ((m = implementsRegex.exec(content)) !== null) {
      const cls = entityByName.get(m[1]);
      const interfaces = m[2].split(',').map(s => s.trim());
      for (const iface of interfaces) {
        const target = entityByName.get(iface);
        if (cls && target) relations.push(this.makeRelation(cls.id, target.id, 'implements'));
      }
    }

    return relations;
  }

  private analyzeCalls(content: string, file: string, entityByName: Map<string, CodeEntity>, entityByFile: Map<string, CodeEntity[]>): CodeRelation[] {
    const relations: CodeRelation[] = [];
    const fileEntities = entityByFile.get(file) || [];
    const callCounts = new Map<string, number>();

    for (const entity of fileEntities) {
      if (entity.type !== 'function' && entity.type !== 'method') continue;

      // Check if this entity's code references other known entities
      for (const [name, target] of entityByName) {
        if (target.id === entity.id) continue;
        if (target.type === 'file') continue;

        const callRegex = new RegExp(`\\b${name}\\s*\\(`, 'g');
        const entityCode = content.split('\n').slice(entity.startLine - 1, entity.endLine).join('\n');
        const matches = entityCode.match(callRegex);
        if (matches && matches.length > 0) {
          const key = `${entity.id}:${target.id}`;
          callCounts.set(key, (callCounts.get(key) || 0) + matches.length);
          relations.push(this.makeRelation(entity.id, target.id, 'calls', matches.length));
        }
      }
    }

    return relations;
  }

  private analyzeTestRelations(file: string, entityByFile: Map<string, CodeEntity[]>): CodeRelation[] {
    const relations: CodeRelation[] = [];
    if (!/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) && !file.includes('__tests__')) return relations;

    // Match test file to source file by naming convention
    const sourceFile = file
      .replace(/\.(test|spec)\./, '.')
      .replace('__tests__/', '')
      .replace('test/', 'src/')
      .replace('tests/', 'src/');

    const testEntities = entityByFile.get(file) || [];
    const sourceEntities = entityByFile.get(sourceFile) || [];

    if (sourceEntities.length > 0) {
      const sourceFileEntity = sourceEntities.find(e => e.type === 'file');
      const testFileEntity = testEntities.find(e => e.type === 'file');
      if (sourceFileEntity && testFileEntity) {
        relations.push(this.makeRelation(testFileEntity.id, sourceFileEntity.id, 'tests'));
      }
    }

    return relations;
  }

  private resolveImportPath(fromFile: string, importPath: string): string {
    const dir = path.dirname(fromFile);
    let resolved = path.join(dir, importPath).replace(/\\/g, '/');
    // Try common extensions
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
      const full = resolved + ext;
      if (fs.existsSync(path.join(this.workspaceRoot, full))) return full;
    }
    return resolved;
  }

  private makeRelation(sourceId: string, targetId: string, type: RelationType, weight: number = 1): CodeRelation {
    return {
      id: crypto.createHash('md5').update(`${sourceId}:${targetId}:${type}`).digest('hex').slice(0, 16),
      sourceId, targetId, type, weight,
    };
  }

  private deduplicateRelations(relations: CodeRelation[]): CodeRelation[] {
    const seen = new Map<string, CodeRelation>();
    for (const r of relations) {
      const key = `${r.sourceId}:${r.targetId}:${r.type}`;
      const existing = seen.get(key);
      if (existing) { existing.weight += r.weight; }
      else { seen.set(key, { ...r }); }
    }
    return Array.from(seen.values());
  }
}
