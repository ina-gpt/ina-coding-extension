/**
 * InfraAnalyzer.ts — Phase 19 Step 19.5
 * Analyze existing infrastructure configs for issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { InfraRecommendation } from './DevOpsTypes';
import { Logger } from '../../utils/Logger';

export class InfraAnalyzer {
  private root: string;

  constructor(workspaceRoot: string) {
    this.root = workspaceRoot;
  }

  analyze(): InfraRecommendation[] {
    const recommendations: InfraRecommendation[] = [];
    recommendations.push(...this.analyzeDockerfile());
    recommendations.push(...this.analyzeDockerCompose());
    recommendations.push(...this.analyzeCI());
    recommendations.push(...this.analyzeEnvFiles());
    recommendations.push(...this.analyzeMissingFiles());
    return recommendations;
  }

  private analyzeDockerfile(): InfraRecommendation[] {
    const recs: InfraRecommendation[] = [];
    const content = this.readFile('Dockerfile');
    if (!content) return recs;

    if (!content.includes('USER') || content.includes('USER root')) {
      recs.push({ category: 'security', severity: 'critical', message: 'Container runs as root user', suggestedChange: 'Add a non-root USER directive', file: 'Dockerfile', autoFixable: true });
    }
    if (/:latest\b/.test(content) && !content.includes(':latest AS')) {
      recs.push({ category: 'reliability', severity: 'warning', message: 'Using :latest tag — builds are not reproducible', suggestedChange: 'Pin image versions (e.g., node:22-alpine)', file: 'Dockerfile', autoFixable: true });
    }
    if (!content.includes('HEALTHCHECK')) {
      recs.push({ category: 'reliability', severity: 'warning', message: 'No HEALTHCHECK defined', suggestedChange: 'Add HEALTHCHECK CMD for container orchestration', file: 'Dockerfile', autoFixable: true });
    }
    if (!content.includes('AS ') && !content.includes(' as ')) {
      recs.push({ category: 'performance', severity: 'warning', message: 'No multi-stage build — larger image size', suggestedChange: 'Use multi-stage build to reduce production image size', file: 'Dockerfile', autoFixable: false });
    }
    if (/COPY \. \./.test(content) && !content.includes('package*.json')) {
      recs.push({ category: 'performance', severity: 'info', message: 'Copy all files before install — breaks layer caching', suggestedChange: 'COPY package*.json first, then npm install, then COPY rest', file: 'Dockerfile', autoFixable: false });
    }
    if (/ENV.*PASSWORD|ENV.*SECRET|ENV.*KEY/i.test(content)) {
      recs.push({ category: 'security', severity: 'critical', message: 'Secrets embedded in Dockerfile ENV', suggestedChange: 'Use runtime env vars or secrets management', file: 'Dockerfile', autoFixable: false });
    }
    return recs;
  }

  private analyzeDockerCompose(): InfraRecommendation[] {
    const recs: InfraRecommendation[] = [];
    const content = this.readFile('docker-compose.yml') || this.readFile('docker-compose.yaml');
    if (!content) return recs;

    if (!content.includes('restart:')) {
      recs.push({ category: 'reliability', severity: 'warning', message: 'No restart policy in docker-compose', suggestedChange: 'Add restart: unless-stopped', file: 'docker-compose.yml', autoFixable: true });
    }
    if (!content.includes('healthcheck:')) {
      recs.push({ category: 'reliability', severity: 'warning', message: 'No healthchecks in docker-compose services', suggestedChange: 'Add healthcheck for each service', file: 'docker-compose.yml', autoFixable: false });
    }
    if (/password:\s*\w+/i.test(content) && !content.includes('${')) {
      recs.push({ category: 'security', severity: 'critical', message: 'Hardcoded passwords in docker-compose', suggestedChange: 'Use env_file or ${VAR} references', file: 'docker-compose.yml', autoFixable: true });
    }
    return recs;
  }

  private analyzeCI(): InfraRecommendation[] {
    const recs: InfraRecommendation[] = [];
    const ghContent = this.findGithubWorkflow();
    if (ghContent) {
      if (!ghContent.includes('audit') && !ghContent.includes('security') && !ghContent.includes('trivy')) {
        recs.push({ category: 'security', severity: 'warning', message: 'No security scanning step in CI pipeline', suggestedChange: 'Add npm audit or Trivy container scan', file: '.github/workflows/', autoFixable: true });
      }
      if (!ghContent.includes('cache')) {
        recs.push({ category: 'performance', severity: 'info', message: 'No dependency caching in CI', suggestedChange: 'Add actions/cache or setup-node cache option', file: '.github/workflows/', autoFixable: true });
      }
    }
    return recs;
  }

  private analyzeEnvFiles(): InfraRecommendation[] {
    const recs: InfraRecommendation[] = [];
    if (this.fileExists('.env') && !this.fileExists('.env.example')) {
      recs.push({ category: 'security', severity: 'warning', message: '.env exists without .env.example for documentation', suggestedChange: 'Create .env.example with keys but no values', autoFixable: true });
    }
    const gitignore = this.readFile('.gitignore') || '';
    if (this.fileExists('.env') && !gitignore.includes('.env')) {
      recs.push({ category: 'security', severity: 'critical', message: '.env is not in .gitignore — secrets may be committed!', suggestedChange: 'Add .env to .gitignore immediately', file: '.gitignore', autoFixable: true });
    }
    return recs;
  }

  private analyzeMissingFiles(): InfraRecommendation[] {
    const recs: InfraRecommendation[] = [];
    if (!this.fileExists('.dockerignore') && this.fileExists('Dockerfile')) {
      recs.push({ category: 'performance', severity: 'warning', message: 'Dockerfile exists but no .dockerignore', suggestedChange: 'Create .dockerignore to exclude node_modules, .git, etc.', autoFixable: true });
    }
    return recs;
  }

  private readFile(p: string): string | null { try { return fs.readFileSync(path.join(this.root, p), 'utf-8'); } catch { return null; } }
  private fileExists(p: string): boolean { try { return fs.existsSync(path.join(this.root, p)); } catch { return false; } }
  private findGithubWorkflow(): string | null {
    try {
      const dir = path.join(this.root, '.github', 'workflows');
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.yml') || f.endsWith('.yaml')) return fs.readFileSync(path.join(dir, f), 'utf-8');
      }
    } catch { /* */ }
    return null;
  }
}
