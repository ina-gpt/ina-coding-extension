/**
 * ImpactAnalyzer.ts — Phase 19 Step 19.4
 * Analyze impact of code changes across the knowledge graph
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { CodeEntity, CodeRelation, ImpactAnalysis, KnowledgeGraph } from './KnowledgeTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class ImpactAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  analyze(changedFiles: string[], graph: KnowledgeGraph): ImpactAnalysis[] {
    const results: ImpactAnalysis[] = [];
    const adjacency = this.buildAdjacency(graph.relations);

    for (const file of changedFiles) {
      // Find all entities in this file
      const fileEntities = Array.from(graph.entities.values())
        .filter(e => e.filePath === file && e.type !== 'file');

      for (const entity of fileEntities) {
        const directlyAffected = this.getDirectDependents(entity.id, adjacency, graph.entities);
        const transitivelyAffected = this.getTransitiveDependents(entity.id, adjacency, graph.entities, 3);
        const suggestedTests = this.findTestFiles(entity.id, adjacency, graph);
        const riskScore = this.computeRiskScore(entity, directlyAffected, transitivelyAffected);

        if (directlyAffected.length > 0 || transitivelyAffected.length > 0) {
          results.push({
            changedEntity: entity,
            directlyAffected,
            transitivelyAffected,
            riskScore,
            suggestedTestFiles: suggestedTests,
          });
        }
      }
    }

    // Sort by risk score descending
    results.sort((a, b) => b.riskScore - a.riskScore);
    return results;
  }

  async getChangedFiles(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD 2>/dev/null', { cwd: this.workspaceRoot, timeout: 5000 });
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  generateSummary(analyses: ImpactAnalysis[]): string {
    if (analyses.length === 0) return 'No significant impact detected.';

    const totalDirect = new Set(analyses.flatMap(a => a.directlyAffected.map(e => e.filePath))).size;
    const totalTransitive = new Set(analyses.flatMap(a => a.transitivelyAffected.map(e => e.filePath))).size;
    const highRisk = analyses.filter(a => a.riskScore >= 70).length;
    const testFiles = new Set(analyses.flatMap(a => a.suggestedTestFiles)).size;

    const parts: string[] = [];
    parts.push(`Changes affect ${totalDirect} file(s) directly, ${totalTransitive} transitively.`);
    if (highRisk > 0) parts.push(`${highRisk} high-risk change(s) detected.`);
    if (testFiles > 0) parts.push(`${testFiles} test file(s) should be run.`);

    return parts.join(' ');
  }

  private buildAdjacency(relations: CodeRelation[]): Map<string, { targetId: string; type: string }[]> {
    const adj = new Map<string, { targetId: string; type: string }[]>();
    for (const r of relations) {
      // Reverse direction: who depends on this entity
      const deps = adj.get(r.targetId) || [];
      deps.push({ targetId: r.sourceId, type: r.type });
      adj.set(r.targetId, deps);
    }
    return adj;
  }

  private getDirectDependents(entityId: string, adjacency: Map<string, { targetId: string; type: string }[]>, entities: Map<string, CodeEntity>): CodeEntity[] {
    const deps = adjacency.get(entityId) || [];
    return deps
      .map(d => entities.get(d.targetId))
      .filter((e): e is CodeEntity => !!e && e.type !== 'file');
  }

  private getTransitiveDependents(entityId: string, adjacency: Map<string, { targetId: string; type: string }[]>, entities: Map<string, CodeEntity>, maxDepth: number): CodeEntity[] {
    const visited = new Set<string>([entityId]);
    const result: CodeEntity[] = [];
    let frontier = [entityId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        const deps = adjacency.get(id) || [];
        for (const d of deps) {
          if (!visited.has(d.targetId)) {
            visited.add(d.targetId);
            const entity = entities.get(d.targetId);
            if (entity && entity.type !== 'file') {
              result.push(entity);
              nextFrontier.push(d.targetId);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    return result;
  }

  private findTestFiles(entityId: string, adjacency: Map<string, { targetId: string; type: string }[]>, graph: KnowledgeGraph): string[] {
    const testFiles = new Set<string>();

    // Direct test relations
    const deps = adjacency.get(entityId) || [];
    for (const d of deps) {
      const rel = graph.relations.find(r => r.sourceId === d.targetId && r.targetId === entityId && r.type === 'tests');
      if (rel) {
        const testEntity = graph.entities.get(d.targetId);
        if (testEntity) testFiles.add(testEntity.filePath);
      }
    }

    // Also find by naming convention
    const entity = graph.entities.get(entityId);
    if (entity) {
      for (const [, e] of graph.entities) {
        if (e.type === 'file' && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(e.filePath)) {
          if (e.filePath.includes(entity.name) || e.filePath.includes(entity.filePath.replace(/\.\w+$/, ''))) {
            testFiles.add(e.filePath);
          }
        }
      }
    }

    return Array.from(testFiles);
  }

  private computeRiskScore(entity: CodeEntity, direct: CodeEntity[], transitive: CodeEntity[]): number {
    let score = 0;
    score += Math.min(30, direct.length * 5);
    score += Math.min(20, transitive.length * 2);
    score += Math.min(20, (entity.complexity || 1) * 3);
    if (entity.isExported) score += 10;
    if (entity.type === 'class' || entity.type === 'interface') score += 10;
    return Math.min(100, score);
  }
}
