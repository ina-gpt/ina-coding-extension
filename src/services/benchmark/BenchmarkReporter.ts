/**
 * BenchmarkReporter.ts
 * Phase 17.6 - Performance Benchmarking Reporter
 *
 * Formats benchmark results for console, markdown, JSON, and file export.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import {
  BenchmarkResult,
  BenchmarkSuite,
  BenchmarkStatus,
} from './BenchmarkTypes';

export class BenchmarkReporter {
  private static instance: BenchmarkReporter;

  private constructor() {}

  static getInstance(): BenchmarkReporter {
    if (!BenchmarkReporter.instance) {
      BenchmarkReporter.instance = new BenchmarkReporter();
    }
    return BenchmarkReporter.instance;
  }

  /**
   * Format suite results as a human-readable console string with box-drawing characters.
   */
  formatConsole(suite: BenchmarkSuite): string {
    const lines: string[] = [];
    const width = 72;

    lines.push(`\u250C${'─'.repeat(width)}\u2510`);
    lines.push(`\u2502 ${this.padRight(`Performance Benchmark: ${suite.name}`, width - 1)}\u2502`);
    lines.push(`\u251C${'─'.repeat(width)}\u2524`);

    // Environment info
    const env = suite.environment;
    lines.push(`\u2502 ${this.padRight(`Node: ${env.nodeVersion}  |  VS Code: ${env.vscodeVersion}  |  Extension: ${env.extensionVersion}`, width - 1)}\u2502`);
    lines.push(`\u2502 ${this.padRight(`Platform: ${env.platform}  |  Model: ${env.model}`, width - 1)}\u2502`);
    lines.push(`\u251C${'─'.repeat(width)}\u2524`);

    // Results header
    lines.push(
      `\u2502 ${this.padRight('Benchmark', 32)} ${this.padRight('Value', 12)} ${this.padRight('Target', 10)} ${this.padRight('Status', 8)}\u2502`
    );
    lines.push(`\u251C${'─'.repeat(width)}\u2524`);

    // Group results by category
    const categories = this.groupByCategory(suite.results);
    for (const [category, results] of Object.entries(categories)) {
      lines.push(`\u2502 ${this.padRight(`── ${category.toUpperCase()} ──`, width - 1)}\u2502`);

      for (const result of results) {
        const statusIcon = this.getStatusIcon(result.status);
        const valueStr = `${result.value}${result.unit}`;
        const targetStr = `${result.target}${result.unit}`;

        lines.push(
          `\u2502 ${statusIcon} ${this.padRight(result.name, 30)} ${this.padRight(valueStr, 12)} ${this.padRight(targetStr, 10)} ${this.padRight(result.status.toUpperCase(), 6)}\u2502`
        );

        if (result.details) {
          lines.push(`\u2502   ${this.padRight(`  \u2514\u2500 ${result.details}`, width - 2)}\u2502`);
        }
      }
    }

    // Summary
    lines.push(`\u251C${'─'.repeat(width)}\u2524`);
    const summary = `Passed: ${suite.totalPassed}  |  Warned: ${suite.totalWarned}  |  Failed: ${suite.totalFailed}  |  Time: ${suite.runTimeMs}ms`;
    lines.push(`\u2502 ${this.padRight(summary, width - 1)}\u2502`);
    lines.push(`\u2514${'─'.repeat(width)}\u2518`);

    return lines.join('\n');
  }

  /**
   * Format suite results as a markdown table.
   */
  formatMarkdown(suite: BenchmarkSuite): string {
    const lines: string[] = [];

    lines.push(`# Performance Benchmark: ${suite.name}`);
    lines.push('');
    lines.push(`**Date:** ${new Date().toISOString()}`);
    lines.push(`**Node:** ${suite.environment.nodeVersion} | **VS Code:** ${suite.environment.vscodeVersion} | **Extension:** ${suite.environment.extensionVersion}`);
    lines.push(`**Platform:** ${suite.environment.platform} | **Model:** ${suite.environment.model}`);
    lines.push('');

    // Results table
    lines.push('| Status | Benchmark | Value | Target | Details |');
    lines.push('|--------|-----------|-------|--------|---------|');

    const categories = this.groupByCategory(suite.results);
    for (const [category, results] of Object.entries(categories)) {
      lines.push(`| | **${category.toUpperCase()}** | | | |`);

      for (const result of results) {
        const statusEmoji = this.getStatusEmoji(result.status);
        const valueStr = `${result.value} ${result.unit}`;
        const targetStr = `${result.target} ${result.unit}`;
        const details = result.details ?? '-';
        lines.push(`| ${statusEmoji} | ${result.name} | ${valueStr} | ${targetStr} | ${details} |`);
      }
    }

    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Passed:** ${suite.totalPassed}`);
    lines.push(`- **Warned:** ${suite.totalWarned}`);
    lines.push(`- **Failed:** ${suite.totalFailed}`);
    lines.push(`- **Total Time:** ${suite.runTimeMs}ms`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format suite results as a JSON string.
   */
  formatJson(suite: BenchmarkSuite): string {
    return JSON.stringify(suite, null, 2);
  }

  /**
   * Export suite results to a file.
   */
  async exportToFile(suite: BenchmarkSuite, filePath: string): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ext = path.extname(filePath).toLowerCase();
      let content: string;

      switch (ext) {
        case '.md':
          content = this.formatMarkdown(suite);
          break;
        case '.json':
          content = this.formatJson(suite);
          break;
        default:
          content = this.formatConsole(suite);
          break;
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      Logger.info(`[BenchmarkReporter] Exported benchmark results to ${filePath}`);
    } catch (error: any) {
      Logger.error(`[BenchmarkReporter] Failed to export to ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Group results by category.
   */
  private groupByCategory(results: BenchmarkResult[]): Record<string, BenchmarkResult[]> {
    const grouped: Record<string, BenchmarkResult[]> = {};
    for (const result of results) {
      if (!grouped[result.category]) {
        grouped[result.category] = [];
      }
      grouped[result.category].push(result);
    }
    return grouped;
  }

  /**
   * Get a status icon for console output.
   */
  private getStatusIcon(status: BenchmarkStatus): string {
    switch (status) {
      case 'pass': return '\u2705';
      case 'warn': return '\u26A0\uFE0F';
      case 'fail': return '\u274C';
    }
  }

  /**
   * Get a status emoji for markdown output.
   */
  private getStatusEmoji(status: BenchmarkStatus): string {
    switch (status) {
      case 'pass': return ':white_check_mark:';
      case 'warn': return ':warning:';
      case 'fail': return ':x:';
    }
  }

  /**
   * Pad a string to the right to a given width.
   */
  private padRight(str: string, width: number): string {
    if (str.length >= width) {
      return str.substring(0, width);
    }
    return str + ' '.repeat(width - str.length);
  }
}
