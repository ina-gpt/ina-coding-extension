/**
 * StackDetector.ts — Phase 19 Step 19.5
 * Auto-detect project stack, framework, databases, existing infra
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectStack } from './DevOpsTypes';
import { Logger } from '../../utils/Logger';

export class StackDetector {
  private root: string;

  constructor(workspaceRoot: string) {
    this.root = workspaceRoot;
  }

  detect(): ProjectStack {
    const stack: ProjectStack = {
      runtime: 'unknown', framework: '', packageManager: '', buildTool: '',
      testRunner: '', databases: [], existingDocker: false, existingCI: null,
      existingDeploy: null, ports: [3000],
    };

    // Runtime & package manager
    if (this.exists('package.json')) {
      stack.runtime = 'node';
      stack.packageManager = this.exists('pnpm-lock.yaml') ? 'pnpm' : this.exists('yarn.lock') ? 'yarn' : 'npm';
      const pkg = this.readJson('package.json');
      const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      // Framework
      if (allDeps?.next) { stack.framework = 'next'; stack.ports = [3000]; }
      else if (allDeps?.express) { stack.framework = 'express'; stack.ports = [3000]; }
      else if (allDeps?.fastify) { stack.framework = 'fastify'; stack.ports = [3000]; }
      else if (allDeps?.['@nestjs/core']) { stack.framework = 'nestjs'; stack.ports = [3000]; }
      else if (allDeps?.nuxt) { stack.framework = 'nuxt'; stack.ports = [3000]; }
      else if (allDeps?.react) stack.framework = 'react';
      else if (allDeps?.vue) stack.framework = 'vue';
      // Build tool
      stack.buildTool = allDeps?.vite ? 'vite' : allDeps?.webpack ? 'webpack' : allDeps?.esbuild ? 'esbuild' : allDeps?.next ? 'next' : 'tsc';
      // Test runner
      stack.testRunner = allDeps?.vitest ? 'vitest' : allDeps?.jest ? 'jest' : allDeps?.mocha ? 'mocha' : '';
      // Databases
      if (allDeps?.pg || allDeps?.['@prisma/client'] || allDeps?.typeorm) stack.databases.push('postgres');
      if (allDeps?.mysql2 || allDeps?.mysql) stack.databases.push('mysql');
      if (allDeps?.mongoose || allDeps?.mongodb) stack.databases.push('mongodb');
      if (allDeps?.redis || allDeps?.ioredis) stack.databases.push('redis');
      // Port from scripts
      const startScript = pkg?.scripts?.start || pkg?.scripts?.dev || '';
      const portMatch = startScript.match(/(?:PORT|port)[=:]\s*(\d+)/);
      if (portMatch) stack.ports = [parseInt(portMatch[1], 10)];
    } else if (this.exists('requirements.txt') || this.exists('pyproject.toml') || this.exists('Pipfile')) {
      stack.runtime = 'python';
      stack.packageManager = this.exists('Pipfile') ? 'pipenv' : this.exists('pyproject.toml') ? 'poetry' : 'pip';
      const reqs = this.readFile('requirements.txt') || '';
      if (/fastapi/i.test(reqs)) { stack.framework = 'fastapi'; stack.ports = [8000]; }
      else if (/django/i.test(reqs)) { stack.framework = 'django'; stack.ports = [8000]; }
      else if (/flask/i.test(reqs)) { stack.framework = 'flask'; stack.ports = [5000]; }
      stack.testRunner = 'pytest';
      if (/psycopg|sqlalchemy/i.test(reqs)) stack.databases.push('postgres');
    } else if (this.exists('go.mod')) {
      stack.runtime = 'go';
      stack.packageManager = 'go';
      const goMod = this.readFile('go.mod') || '';
      if (/gin-gonic/i.test(goMod)) { stack.framework = 'gin'; stack.ports = [8080]; }
      else if (/echo/i.test(goMod)) { stack.framework = 'echo'; stack.ports = [8080]; }
      stack.testRunner = 'go test';
      stack.buildTool = 'go build';
    } else if (this.exists('Cargo.toml')) {
      stack.runtime = 'rust';
      stack.packageManager = 'cargo';
      const cargo = this.readFile('Cargo.toml') || '';
      if (/actix-web/i.test(cargo)) { stack.framework = 'actix'; stack.ports = [8080]; }
      else if (/axum/i.test(cargo)) { stack.framework = 'axum'; stack.ports = [3000]; }
      stack.testRunner = 'cargo test';
      stack.buildTool = 'cargo build';
    } else if (this.exists('pom.xml') || this.exists('build.gradle')) {
      stack.runtime = 'java';
      stack.packageManager = this.exists('pom.xml') ? 'maven' : 'gradle';
      stack.framework = 'spring';
      stack.ports = [8080];
      stack.testRunner = this.exists('pom.xml') ? 'maven test' : 'gradle test';
    }

    // Docker
    stack.existingDocker = this.exists('Dockerfile') || this.exists('docker-compose.yml') || this.exists('docker-compose.yaml');
    // CI
    if (this.exists('.github/workflows')) stack.existingCI = 'github-actions';
    else if (this.exists('.gitlab-ci.yml')) stack.existingCI = 'gitlab-ci';
    else if (this.exists('Jenkinsfile')) stack.existingCI = 'jenkins';
    else if (this.exists('bitbucket-pipelines.yml')) stack.existingCI = 'bitbucket';
    // Deploy
    if (this.exists('vercel.json')) stack.existingDeploy = 'vercel';
    else if (this.exists('fly.toml')) stack.existingDeploy = 'fly';
    else if (this.exists('render.yaml')) stack.existingDeploy = 'render';
    else if (this.exists('railway.json')) stack.existingDeploy = 'railway';
    else if (this.findFiles('k8s/', /\.ya?ml$/)) stack.existingDeploy = 'k8s';

    Logger.info(`[StackDetector] ${stack.runtime}/${stack.framework} (${stack.packageManager}), DB: ${stack.databases.join(',') || 'none'}, CI: ${stack.existingCI || 'none'}`);
    return stack;
  }

  private exists(p: string): boolean { try { return fs.existsSync(path.join(this.root, p)); } catch { return false; } }
  private readFile(p: string): string | null { try { return fs.readFileSync(path.join(this.root, p), 'utf-8'); } catch { return null; } }
  private readJson(p: string): any { try { return JSON.parse(fs.readFileSync(path.join(this.root, p), 'utf-8')); } catch { return null; } }
  private findFiles(dir: string, pattern: RegExp): boolean {
    try { return fs.readdirSync(path.join(this.root, dir)).some(f => pattern.test(f)); } catch { return false; }
  }
}
