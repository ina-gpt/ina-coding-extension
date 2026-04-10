import { EventEmitter } from 'events';
import { VisionClient } from './VisionClient';
import { ImageAttachment, DesignToCodeConfig, DesignToCodeResponse } from './VisionTypes';
import { Logger } from '../../utils/Logger';

interface DesignToCodeProgress {
  phase: 'analyzing' | 'generating' | 'refining' | 'complete';
  content: string;
  components: { name: string; code: string; filePath: string }[] | null;
}

export class DesignToCodeService extends EventEmitter {
  private static instance: DesignToCodeService;
  private visionClient: VisionClient;

  static getInstance(): DesignToCodeService {
    if (!DesignToCodeService.instance) {
      DesignToCodeService.instance = new DesignToCodeService();
    }
    return DesignToCodeService.instance;
  }

  private constructor() {
    super();
    this.visionClient = VisionClient.getInstance();
  }

  async *convertDesign(image: ImageAttachment, config: DesignToCodeConfig): AsyncGenerator<DesignToCodeProgress> {
    yield { phase: 'analyzing', content: 'Analyzing design...', components: null };

    let fullCode = '';
    yield { phase: 'generating', content: '', components: null };

    try {
      for await (const chunk of this.visionClient.designToCode(image, config)) {
        if (chunk.type === 'token') {
          fullCode += chunk.content;
          yield { phase: 'generating', content: fullCode, components: null };
        }
      }
    } catch (error) {
      Logger.error('Design to code generation failed:', error);
      yield { phase: 'complete', content: fullCode || 'Generation failed', components: null };
      return;
    }

    const parsed = this.parseGeneratedCode(fullCode, config);
    yield { phase: 'complete', content: fullCode, components: parsed.components };
  }

  parseGeneratedCode(rawCode: string, config?: DesignToCodeConfig): { components: { name: string; code: string; filePath: string }[]; dependencies: string[] } {
    const ext = config?.targetLanguage === 'javascript' ? 'jsx' : 'tsx';
    const components: { name: string; code: string; filePath: string }[] = [];
    const dependencies: string[] = [];

    const markerRegex = /\/\/\s*---\s*(\w+(?:\.\w+)?)\s*---/g;
    const parts = rawCode.split(markerRegex);

    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i += 2) {
        const name = parts[i].replace(/\.\w+$/, '');
        const code = (parts[i + 1] || '').trim();
        const fileName = parts[i].includes('.') ? parts[i] : `${name}.${ext}`;
        components.push({ name, code, filePath: `src/components/${fileName}` });
      }
    } else {
      const nameMatch = rawCode.match(/(?:export\s+(?:default\s+)?)?(?:function|const|class)\s+(\w+)/);
      const name = nameMatch ? nameMatch[1] : 'GeneratedComponent';
      components.push({ name, code: rawCode.trim(), filePath: `src/components/${name}.${ext}` });
    }

    const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(rawCode)) !== null) {
      const pkg = match[1];
      if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
        const pkgName = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
        if (!dependencies.includes(pkgName) && pkgName !== 'react') dependencies.push(pkgName);
      }
    }

    return { components, dependencies };
  }

  async applyGeneratedCode(components: { name: string; code: string; filePath: string }[], workspaceRoot: string): Promise<string[]> {
    const { promises: fsp } = require('fs');
    const path = require('path');
    const created: string[] = [];

    for (const comp of components) {
      const fullPath = path.join(workspaceRoot, comp.filePath);
      const dir = path.dirname(fullPath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(fullPath, comp.code, 'utf-8');
      created.push(comp.filePath);
    }

    return created;
  }

  getFrameworkDefaults(framework: string): { extension: string; importStyle: string; componentStyle: string } {
    const defaults: Record<string, { extension: string; importStyle: string; componentStyle: string }> = {
      react: { extension: 'tsx', importStyle: 'import React from "react"', componentStyle: 'functional' },
      vue: { extension: 'vue', importStyle: '<script setup lang="ts">', componentStyle: 'composition' },
      html: { extension: 'html', importStyle: '<link> / <script>', componentStyle: 'vanilla' },
      svelte: { extension: 'svelte', importStyle: '<script lang="ts">', componentStyle: 'component' },
      angular: { extension: 'ts', importStyle: 'import { Component } from "@angular/core"', componentStyle: 'class' },
    };
    return defaults[framework] || defaults.react;
  }
}
