/**
 * ArchitectureAnalyzer.ts — Phase 19 Step 19.4
 * Detect and analyze architecture layers and patterns
 */

import { KnowledgeGraph, ArchitectureLayer, CodeEntity, CodeRelation } from './KnowledgeTypes';
import { Logger } from '../../utils/Logger';

const LAYER_PATTERNS: { name: string; patterns: string[]; description: string }[] = [
  { name: 'Presentation', patterns: ['routes/', 'pages/', 'views/', 'controllers/', 'components/', 'screens/', 'handlers/'], description: 'UI, routing, request handling' },
  { name: 'Application', patterns: ['services/', 'usecases/', 'application/', 'commands/', 'queries/'], description: 'Business logic, orchestration' },
  { name: 'Domain', patterns: ['models/', 'entities/', 'domain/', 'types/', 'interfaces/'], description: 'Core domain models and interfaces' },
  { name: 'Infrastructure', patterns: ['lib/', 'utils/', 'helpers/', 'adapters/', 'repositories/', 'db/', 'database/'], description: 'External integrations, persistence, utilities' },
  { name: 'Configuration', patterns: ['config/', 'settings/', '.env', 'constants/'], description: 'Configuration and constants' },
  { name: 'Testing', patterns: ['test/', 'tests/', '__tests__/', 'spec/', '.test.', '.spec.'], description: 'Test suites' },
];

export class ArchitectureAnalyzer {
  detectLayers(graph: KnowledgeGraph): ArchitectureLayer[] {
    const layers: ArchitectureLayer[] = [];

    for (const layerDef of LAYER_PATTERNS) {
      const matchingEntities: string[] = [];

      for (const [id, entity] of graph.entities) {
        if (entity.type !== 'file') continue;
        const fileLower = entity.filePath.toLowerCase();
        if (layerDef.patterns.some(p => fileLower.includes(p.toLowerCase()))) {
          matchingEntities.push(id);
        }
      }

      if (matchingEntities.length > 0) {
        layers.push({
          name: layerDef.name,
          pattern: layerDef.patterns.join(', '),
          entities: matchingEntities,
          description: layerDef.description,
          fileCount: matchingEntities.length,
        });
      }
    }

    // Files not in any layer
    const assignedFiles = new Set(layers.flatMap(l => l.entities));
    const unassigned: string[] = [];
    for (const [id, entity] of graph.entities) {
      if (entity.type === 'file' && !assignedFiles.has(id)) {
        unassigned.push(id);
      }
    }
    if (unassigned.length > 0) {
      layers.push({
        name: 'Other',
        pattern: '*',
        entities: unassigned,
        description: 'Files not matching any known layer pattern',
        fileCount: unassigned.length,
      });
    }

    return layers;
  }

  detectViolations(graph: KnowledgeGraph, layers: ArchitectureLayer[]): { from: string; to: string; file: string; dependency: string }[] {
    const violations: { from: string; to: string; file: string; dependency: string }[] = [];

    const entityToLayer = new Map<string, string>();
    for (const layer of layers) {
      for (const entityId of layer.entities) {
        entityToLayer.set(entityId, layer.name);
      }
    }

    // Layer dependency rules (higher layers can depend on lower, not vice versa)
    const layerOrder = ['Presentation', 'Application', 'Domain', 'Infrastructure', 'Configuration'];
    const forbiddenDeps: Record<string, string[]> = {
      'Domain': ['Presentation', 'Application'],
      'Infrastructure': ['Presentation'],
    };

    for (const relation of graph.relations) {
      if (relation.type !== 'imports') continue;
      const sourceLayer = entityToLayer.get(relation.sourceId);
      const targetLayer = entityToLayer.get(relation.targetId);
      if (!sourceLayer || !targetLayer || sourceLayer === targetLayer) continue;

      const forbidden = forbiddenDeps[sourceLayer];
      if (forbidden?.includes(targetLayer)) {
        const sourceEntity = graph.entities.get(relation.sourceId);
        const targetEntity = graph.entities.get(relation.targetId);
        if (sourceEntity && targetEntity) {
          violations.push({
            from: sourceLayer,
            to: targetLayer,
            file: sourceEntity.filePath,
            dependency: targetEntity.filePath,
          });
        }
      }
    }

    return violations;
  }

  detectPattern(layers: ArchitectureLayer[]): string {
    const names = new Set(layers.map(l => l.name));
    if (names.has('Presentation') && names.has('Application') && names.has('Domain') && names.has('Infrastructure')) {
      return 'Clean Architecture / Hexagonal';
    }
    if (names.has('Presentation') && names.has('Domain') && names.has('Infrastructure')) {
      return 'Layered Architecture (MVC-like)';
    }
    if (names.has('Presentation') && names.has('Application')) {
      return 'Service-Oriented';
    }
    return 'Feature-Based / Flat';
  }

  generateSummary(layers: ArchitectureLayer[], violations: any[]): string {
    const pattern = this.detectPattern(layers);
    const parts: string[] = [
      `Architecture: ${pattern}`,
      `Layers: ${layers.map(l => `${l.name} (${l.fileCount})`).join(', ')}`,
    ];
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.length} layer dependency violation(s) found`);
    } else {
      parts.push('No layer dependency violations detected');
    }
    return parts.join('\n');
  }
}
