/**
 * DependencyScanner.ts — Phase 20 Step 20.3
 * Scan dependencies for outdated versions and vulnerabilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DependencyHealth } from './AnalyticsTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class DependencyScanner {
  private root: string;
  private cache = new Map<string, { data: any; ts: number }>();

  constructor(workspaceRoot: string) { this.root = workspaceRoot; }

  async scan(): Promise<DependencyHealth[]> {
    const pkg = this.readJson('package.json');
    if (!pkg) return [];

    const deps: DependencyHealth[] = [];
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const audit = await this.runAudit();
    const outdated = await this.runOutdated();

    for (const [name, version] of Object.entries(allDeps)) {
      const current = String(version).replace(/^[\^~>=<]/, '');
      const latest = outdated[name]?.latest || current;
      const auditEntry = audit[name];
      const usages = await this.countUsages(name);
      const license = this.getLicense(name);

      deps.push({
        name,
        currentVersion: current,
        latestVersion: latest,
        isOutdated: current !== latest,
        hasVulnerability: !!auditEntry,
        severity: auditEntry?.severity as any,
        licenseType: license,
        directUsages: usages,
      });
    }

    return deps.sort((a, b) => {
      if (a.hasVulnerability && !b.hasVulnerability) return -1;
      if (!a.hasVulnerability && b.hasVulnerability) return 1;
      if (a.isOutdated && !b.isOutdated) return -1;
      return 0;
    });
  }

  private async runAudit(): Promise<Record<string, { severity: string }>> {
    try {
      const { stdout } = await execAsync('npm audit --json 2>/dev/null', { cwd: this.root, timeout: 30000 });
      const data = JSON.parse(stdout);
      const result: Record<string, { severity: string }> = {};
      if (data.vulnerabilities) {
        for (const [name, info] of Object.entries(data.vulnerabilities)) {
          result[name] = { severity: (info as any).severity || 'moderate' };
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private async runOutdated(): Promise<Record<string, { latest: string }>> {
    try {
      const { stdout } = await execAsync('npm outdated --json 2>/dev/null', { cwd: this.root, timeout: 30000 });
      const data = JSON.parse(stdout);
      const result: Record<string, { latest: string }> = {};
      for (const [name, info] of Object.entries(data)) {
        result[name] = { latest: (info as any).latest || '' };
      }
      return result;
    } catch {
      return {};
    }
  }

  private async countUsages(depName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`grep -r "from ['\"]${depName}" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" -l ${this.root}/src 2>/dev/null | wc -l`, { timeout: 5000 });
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  private getLicense(depName: string): string {
    try {
      const pkgPath = path.join(this.root, 'node_modules', depName, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.license || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private readJson(p: string): any {
    try { return JSON.parse(fs.readFileSync(path.join(this.root, p), 'utf-8')); } catch { return null; }
  }
}
