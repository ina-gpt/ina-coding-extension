import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../../../utils/Logger';
import { ImportReference, RenameImpact, DeleteImpact, ImportUpdate } from './FileOpsTypes';

type RawImport = { importPath: string; specifiers: string[]; statement: string; lineNumber: number };

/**
 * Singleton that analyzes import/require statements to build a file dependency graph.
 * Used to auto-update imports on rename/move and warn about broken imports on delete.
 */
export class ImportGraphAnalyzer {
    private static instance: ImportGraphAnalyzer;
    private importCache: Map<string, ImportReference[]> = new Map();

    private constructor() {}

    public static getInstance(): ImportGraphAnalyzer {
        if (!ImportGraphAnalyzer.instance) {
            ImportGraphAnalyzer.instance = new ImportGraphAnalyzer();
        }
        return ImportGraphAnalyzer.instance;
    }

    /** Reads a file, parses its import statements, and resolves paths to ImportReference[]. */
    public async analyzeImports(filePath: string, workspaceRoot: string): Promise<ImportReference[]> {
        const cached = this.importCache.get(filePath);
        if (cached) { return cached; }
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const rawImports = this.parseImports(content, this.detectLanguage(filePath));
            const references: ImportReference[] = [];
            for (const raw of rawImports) {
                const resolvedPath = await this.resolveImportPath(raw.importPath, filePath, workspaceRoot);
                references.push({
                    fromFile: filePath, toFile: resolvedPath || raw.importPath,
                    specifiers: raw.specifiers, importStatement: raw.statement, lineNumber: raw.lineNumber
                });
            }
            this.importCache.set(filePath, references);
            return references;
        } catch (error) {
            Logger.warn(`Failed to analyze imports for ${filePath}: ${error}`);
            return [];
        }
    }

    /** Builds a full import graph from a list of files. */
    public async buildImportGraph(files: string[], workspaceRoot: string): Promise<Map<string, ImportReference[]>> {
        const graph = new Map<string, ImportReference[]>();
        const results = await Promise.allSettled(
            files.map(async (file) => ({ file, refs: await this.analyzeImports(file, workspaceRoot) }))
        );
        for (const r of results) {
            if (r.status === 'fulfilled') { graph.set(r.value.file, r.value.refs); }
        }
        return graph;
    }

    /** Reverse lookup: which files import from the given filePath. */
    public findDependents(filePath: string, graph: Map<string, ImportReference[]>): string[] {
        const normalized = path.normalize(filePath);
        const dependents: string[] = [];
        for (const [src, refs] of graph.entries()) {
            if (refs.some((r) => path.normalize(r.toFile) === normalized)) { dependents.push(src); }
        }
        return dependents;
    }

    /** Which files does filePath import. */
    public findDependencies(filePath: string, graph: Map<string, ImportReference[]>): string[] {
        return (graph.get(filePath) || []).map((r) => r.toFile);
    }

    /** Finds all files importing oldPath and generates updated import statements. */
    public async analyzeRenameImpact(oldPath: string, newPath: string, workspaceRoot: string): Promise<RenameImpact> {
        const graph = await this.buildImportGraph(await this.collectWorkspaceFiles(workspaceRoot), workspaceRoot);
        const dependents = this.findDependents(oldPath, graph);
        const affectedFiles: RenameImpact['affectedFiles'] = [];
        const brokenImports: string[] = [];

        for (const depFile of dependents) {
            const matching = (graph.get(depFile) || []).filter((r) => path.normalize(r.toFile) === path.normalize(oldPath));
            if (!matching.length) { continue; }
            const newRel = this.computeRelativeImport(depFile, newPath);
            affectedFiles.push({
                path: depFile, imports: matching,
                updatedImportStatement: matching.map((m) => m.importStatement.replace(this.extractImportPath(m.importStatement), newRel)).join('\n')
            });
        }

        for (const ref of (graph.get(oldPath) || [])) {
            const resolved = await this.resolveImportPath(this.computeRelativeImport(newPath, ref.toFile), newPath, workspaceRoot);
            if (!resolved) { brokenImports.push(ref.importStatement); }
        }
        return { affectedFiles, brokenImports };
    }

    /** Finds dependents and broken imports for a file being deleted. */
    public async analyzeDeleteImpact(filePath: string, workspaceRoot: string): Promise<DeleteImpact> {
        const graph = await this.buildImportGraph(await this.collectWorkspaceFiles(workspaceRoot), workspaceRoot);
        const dependentFiles = this.findDependents(filePath, graph);
        const normalized = path.normalize(filePath);
        const brokenImports: ImportReference[] = [];
        for (const dep of dependentFiles) {
            for (const ref of (graph.get(dep) || [])) {
                if (path.normalize(ref.toFile) === normalized) { brokenImports.push(ref); }
            }
        }
        const orphanedExports = [...new Set(brokenImports.flatMap((r) => r.specifiers))];
        return { dependentFiles, brokenImports, orphanedExports };
    }

    /** Generates ImportUpdate[] for each file that needs its import path updated after a rename/move. */
    public generateImportUpdates(oldPath: string, newPath: string, affectedFiles: string[], _workspaceRoot: string): ImportUpdate[] {
        const updates: ImportUpdate[] = [];
        const normalizedOld = path.normalize(oldPath);
        for (const filePath of affectedFiles) {
            for (const ref of (this.importCache.get(filePath) || [])) {
                if (path.normalize(ref.toFile) !== normalizedOld) { continue; }
                const newRel = this.computeRelativeImport(filePath, newPath);
                updates.push({
                    filePath, oldImport: ref.importStatement,
                    newImport: ref.importStatement.replace(this.extractImportPath(ref.importStatement), newRel),
                    lineNumber: ref.lineNumber
                });
            }
        }
        return updates;
    }

    /** Regex-based import parser supporting JS/TS, Python, and Go. */
    public parseImports(content: string, language: string): RawImport[] {
        const results: RawImport[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ln = i + 1;
            let m: RegExpMatchArray | null;

            if (language === 'javascript' || language === 'typescript') {
                if ((m = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/))) {
                    const specs = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
                    results.push({ importPath: m[2], specifiers: specs, statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/))) {
                    results.push({ importPath: m[2], specifiers: [`* as ${m[1]}`], statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/))) {
                    results.push({ importPath: m[2], specifiers: [m[1]], statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/))) {
                    const varM = line.match(/(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=/);
                    const specs = varM ? (varM[1] ? varM[1].split(',').map((s) => s.trim()).filter(Boolean) : [varM[2]]) : [];
                    results.push({ importPath: m[1], specifiers: specs, statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/))) {
                    results.push({ importPath: m[1], specifiers: [], statement: line.trim(), lineNumber: ln });
                }
            } else if (language === 'python') {
                if ((m = line.match(/^from\s+(\S+)\s+import\s+(.+)/))) {
                    const specs = m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
                    results.push({ importPath: m[1], specifiers: specs, statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/^import\s+(.+)/))) {
                    for (const mod of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)) {
                        results.push({ importPath: mod, specifiers: [mod], statement: line.trim(), lineNumber: ln });
                    }
                }
            } else if (language === 'go') {
                if ((m = line.match(/^import\s+"([^"]+)"/))) {
                    results.push({ importPath: m[1], specifiers: [], statement: line.trim(), lineNumber: ln });
                } else if ((m = line.match(/^\s+"([^"]+)"/)) && this.isInsideGoImportBlock(lines, i)) {
                    results.push({ importPath: m[1], specifiers: [], statement: line.trim(), lineNumber: ln });
                }
            }
        }
        return results;
    }

    /** Resolves a relative import path to an absolute file path. Handles extensions, index files, tsconfig paths. */
    public async resolveImportPath(importPath: string, fromFile: string, workspaceRoot: string): Promise<string | null> {
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            const tsconfigPaths = await this.readTsConfigPaths(workspaceRoot);
            if (tsconfigPaths) {
                for (const [pattern, targets] of tsconfigPaths.entries()) {
                    const prefix = pattern.replace('/*', '');
                    if (importPath.startsWith(prefix)) {
                        const suffix = importPath.slice(prefix.length);
                        for (const target of targets) {
                            const resolved = await this.tryResolveFile(path.join(workspaceRoot, target.replace('/*', ''), suffix));
                            if (resolved) { return resolved; }
                        }
                    }
                }
            }
            return null;
        }
        return this.tryResolveFile(path.resolve(path.dirname(fromFile), importPath));
    }

    /** Reads tsconfig.json compilerOptions.paths if present. */
    public async readTsConfigPaths(workspaceRoot: string): Promise<Map<string, string[]> | null> {
        try {
            const tsconfig = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'tsconfig.json'), 'utf-8'));
            const paths = tsconfig?.compilerOptions?.paths;
            if (!paths) { return null; }
            const result = new Map<string, string[]>();
            for (const [key, value] of Object.entries(paths)) { result.set(key, value as string[]); }
            return result;
        } catch { return null; }
    }

    public invalidateCache(filePath: string): void { this.importCache.delete(filePath); }
    public clearCache(): void { this.importCache.clear(); }

    // ── Private helpers ──

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        if (['.ts', '.tsx', '.mts', '.cts'].includes(ext)) { return 'typescript'; }
        if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) { return 'javascript'; }
        if (ext === '.py') { return 'python'; }
        if (ext === '.go') { return 'go'; }
        return 'unknown';
    }

    private isInsideGoImportBlock(lines: string[], idx: number): boolean {
        for (let i = idx - 1; i >= 0; i--) {
            const t = lines[i].trim();
            if (t === ')') { return false; }
            if (t.startsWith('import (')) { return true; }
        }
        return false;
    }

    private async tryResolveFile(absPath: string): Promise<string | null> {
        for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.json']) {
            try { await fs.access(absPath + ext); return absPath + ext; } catch { /* next */ }
        }
        for (const idx of ['index.ts', 'index.tsx', 'index.js', 'index.jsx']) {
            try { await fs.access(path.join(absPath, idx)); return path.join(absPath, idx); } catch { /* next */ }
        }
        return null;
    }

    private computeRelativeImport(fromFile: string, toFile: string): string {
        let rel = path.relative(path.dirname(fromFile), toFile);
        rel = rel.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/\/index$/, '');
        return rel.startsWith('.') ? rel : './' + rel;
    }

    private extractImportPath(statement: string): string {
        const m = statement.match(/['"]([^'"]+)['"]/);
        return m ? m[1] : '';
    }

    private async collectWorkspaceFiles(workspaceRoot: string): Promise<string[]> {
        const files: string[] = [];
        const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go']);
        const ignore = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor']);
        const walk = async (dir: string): Promise<void> => {
            try {
                for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory() && !ignore.has(entry.name)) { await walk(full); }
                    else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) { files.push(full); }
                }
            } catch (e) { Logger.warn(`Failed to read directory ${dir}: ${e}`); }
        };
        await walk(workspaceRoot);
        return files;
    }
}

export default ImportGraphAnalyzer.getInstance();
