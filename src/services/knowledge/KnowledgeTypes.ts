/**
 * KnowledgeTypes.ts — Phase 19 Step 19.4
 * Codebase Knowledge Graph type definitions
 */

export type EntityType = 'file' | 'class' | 'function' | 'method' | 'variable' | 'interface' | 'enum' | 'module' | 'type_alias' | 'constant';
export type RelationType = 'imports' | 'extends' | 'implements' | 'calls' | 'uses' | 'overrides' | 'tests' | 'depends_on' | 'exports';

export interface CodeEntity {
  id: string;
  type: EntityType;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  complexity?: number;
  isExported?: boolean;
}

export interface CodeRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  weight: number;
}

export interface KnowledgeGraph {
  entities: Map<string, CodeEntity>;
  relations: CodeRelation[];
  metadata: {
    lastUpdated: string;
    fileCount: number;
    entityCount: number;
    relationCount: number;
    workspaceHash: string;
  };
}

export interface ArchitectureLayer {
  name: string;
  pattern: string;
  entities: string[];
  description: string;
  fileCount: number;
}

export interface ImpactAnalysis {
  changedEntity: CodeEntity;
  directlyAffected: CodeEntity[];
  transitivelyAffected: CodeEntity[];
  riskScore: number;
  suggestedTestFiles: string[];
}

export interface SearchResult {
  entity: CodeEntity;
  relevanceScore: number;
  matchType: 'name' | 'content' | 'docstring' | 'relation';
  context?: string;
}

export interface GraphStats {
  totalEntities: number;
  totalRelations: number;
  byType: Record<EntityType, number>;
  byRelation: Record<RelationType, number>;
  topComplexFunctions: { name: string; file: string; complexity: number }[];
  orphanEntities: number;
}
