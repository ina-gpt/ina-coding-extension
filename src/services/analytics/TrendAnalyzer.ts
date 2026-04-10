/**
 * TrendAnalyzer.ts — Phase 20 Step 20.3
 * Analyze trends from historical analytics snapshots
 */

import { AnalyticsSnapshot, TrendReport, ProjectHealth } from './AnalyticsTypes';

export class TrendAnalyzer {
  analyze(snapshots: AnalyticsSnapshot[]): TrendReport {
    if (snapshots.length < 2) {
      return { period: 'N/A', summary: 'Not enough data for trend analysis. At least 2 snapshots needed.', metricsChange: {}, anomalies: [], recommendations: [] };
    }

    const latest = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];
    const oldest = snapshots[0];
    const period = `${oldest.timestamp.split('T')[0]} → ${latest.timestamp.split('T')[0]}`;

    const metricsChange: Record<string, { before: number; after: number; change: number; trend: string }> = {};
    const anomalies: string[] = [];
    const recommendations: string[] = [];

    // Overall score trend
    const scoreBefore = previous.projectHealth.overallScore;
    const scoreAfter = latest.projectHealth.overallScore;
    const scoreChange = scoreAfter - scoreBefore;
    metricsChange['overallScore'] = { before: scoreBefore, after: scoreAfter, change: scoreChange, trend: scoreChange > 2 ? 'improving' : scoreChange < -2 ? 'declining' : 'stable' };

    // Complexity trend
    const complexityBefore = previous.fileComplexities.reduce((s, f) => s + f.totalComplexity, 0);
    const complexityAfter = latest.fileComplexities.reduce((s, f) => s + f.totalComplexity, 0);
    const complexityChange = complexityAfter - complexityBefore;
    metricsChange['complexity'] = { before: complexityBefore, after: complexityAfter, change: complexityChange, trend: complexityChange < -5 ? 'improving' : complexityChange > 5 ? 'declining' : 'stable' };
    if (complexityChange > 20) anomalies.push(`Complexity spiked by ${complexityChange} points`);

    // Duplication trend
    const dupBefore = previous.duplicationReport.length;
    const dupAfter = latest.duplicationReport.length;
    metricsChange['duplication'] = { before: dupBefore, after: dupAfter, change: dupAfter - dupBefore, trend: dupAfter < dupBefore ? 'improving' : dupAfter > dupBefore ? 'declining' : 'stable' };

    // Dependency health
    const vulnBefore = previous.dependencyHealth.filter(d => d.hasVulnerability).length;
    const vulnAfter = latest.dependencyHealth.filter(d => d.hasVulnerability).length;
    metricsChange['vulnerabilities'] = { before: vulnBefore, after: vulnAfter, change: vulnAfter - vulnBefore, trend: vulnAfter < vulnBefore ? 'improving' : vulnAfter > vulnBefore ? 'declining' : 'stable' };
    if (vulnAfter > vulnBefore) anomalies.push(`${vulnAfter - vulnBefore} new vulnerability(ies) detected`);

    // Generate recommendations
    if (metricsChange['complexity']?.trend === 'declining') recommendations.push('Consider refactoring high-complexity hotspots');
    if (vulnAfter > 0) recommendations.push(`Address ${vulnAfter} dependency vulnerability(ies)`);
    if (dupAfter > 5) recommendations.push(`${dupAfter} code duplication(s) detected — extract shared functions`);

    const hotspots = latest.fileComplexities.filter(f => f.hotspot).length;
    if (hotspots > 3) recommendations.push(`${hotspots} complexity hotspot files — prioritize for review`);

    // Summary
    const parts: string[] = [];
    if (scoreChange > 0) parts.push(`Code health improved by ${scoreChange} points.`);
    else if (scoreChange < 0) parts.push(`Code health declined by ${Math.abs(scoreChange)} points.`);
    else parts.push('Code health is stable.');

    if (complexityChange < 0) parts.push(`Complexity decreased in ${previous.fileComplexities.filter(f => f.hotspot).length} hotspot files.`);
    if (vulnAfter > vulnBefore) parts.push(`${vulnAfter - vulnBefore} new vulnerabilities detected in dependencies.`);
    if (dupAfter < dupBefore) parts.push(`${dupBefore - dupAfter} duplication(s) resolved.`);

    return { period, summary: parts.join(' '), metricsChange, anomalies, recommendations };
  }

  computeHealthScore(snapshot: AnalyticsSnapshot): number {
    let score = 100;
    const hotspots = snapshot.fileComplexities.filter(f => f.hotspot).length;
    score -= Math.min(20, hotspots * 3);
    score -= Math.min(15, snapshot.duplicationReport.length * 2);
    score -= Math.min(20, snapshot.dependencyHealth.filter(d => d.hasVulnerability).length * 5);
    const outdated = snapshot.dependencyHealth.filter(d => d.isOutdated).length;
    score -= Math.min(10, Math.floor(outdated / 5));
    const churning = snapshot.churnMetrics.filter(c => c.isChurning).length;
    score -= Math.min(10, churning * 2);
    return Math.max(0, Math.min(100, score));
  }

  gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }
}
