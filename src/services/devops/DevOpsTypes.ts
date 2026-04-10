/**
 * DevOpsTypes.ts — Phase 19 Step 19.5
 * DevOps & Deployment Agent type definitions
 */

export interface ProjectStack {
  runtime: 'node' | 'python' | 'go' | 'rust' | 'java' | 'unknown';
  framework: string;
  packageManager: string;
  buildTool: string;
  testRunner: string;
  databases: string[];
  existingDocker: boolean;
  existingCI: string | null;
  existingDeploy: string | null;
  ports: number[];
}

export interface DockerConfig {
  baseImage: string;
  stages: { name: string; image: string; commands: string[] }[];
  ports: number[];
  volumes: string[];
  envVars: string[];
  healthcheck: string;
  optimizations: string[];
}

export interface CICDPipeline {
  provider: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'bitbucket';
  stages: string[];
  triggers: string[];
  environments: string[];
  secrets: string[];
  cacheKeys: string[];
}

export type DeploymentTargetType = 'docker-compose' | 'k8s' | 'serverless' | 'bare-metal';

export interface DeploymentTarget {
  type: DeploymentTargetType;
  config: string;
  files: { name: string; content: string }[];
}

export interface InfraRecommendation {
  category: 'security' | 'performance' | 'cost' | 'reliability';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedChange: string;
  file?: string;
  autoFixable: boolean;
}

export interface K8sManifest {
  kind: string;
  name: string;
  content: string;
}

export interface DevOpsConfig {
  autoDetectStack: boolean;
  dockerOptimize: boolean;
  ciProvider: string;
  includeSecurityScan: boolean;
  k8sNamespace: string;
  k8sReplicas: number;
}

export const DEFAULT_DEVOPS_CONFIG: DevOpsConfig = {
  autoDetectStack: true,
  dockerOptimize: true,
  ciProvider: 'auto',
  includeSecurityScan: true,
  k8sNamespace: 'default',
  k8sReplicas: 2,
};

export interface DevOpsGenerationResult {
  type: 'dockerfile' | 'ci' | 'k8s' | 'compose' | 'env';
  files: { name: string; content: string }[];
  recommendations: InfraRecommendation[];
}
