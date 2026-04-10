/**
 * DebtPrioritizer.ts — Phase 20 Step 20.4
 * Prioritize debt items by severity, churn, dependencies, age
 */

import { DebtItem, SprintDebtAllocation } from './DebtTypes';

const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };

export class DebtPrioritizer {
  private churnScores: Map<string, number>;
  private dependencyScores: Map<string, number>;

  constructor(churnScores?: Map<string, number>, dependencyScores?: Map<string, number>) {
    this.churnScores = churnScores || new Map();
    this.dependencyScores = dependencyScores || new Map();
  }

  prioritize(items: DebtItem[]): DebtItem[] {
    const scored = items.map(item => ({
      item,
      score: this.computeScore(item),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.item);
  }

  getQuickWins(items: DebtItem[], maxItems: number = 5): DebtItem[] {
    return items
      .filter(i => i.status === 'open')
      .filter(i => i.estimatedEffort <= 1 && (i.severity === 'medium' || i.severity === 'high'))
      .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
      .slice(0, maxItems);
  }

  planSprint(items: DebtItem[], budgetHours: number, sprintName: string = 'Sprint'): SprintDebtAllocation {
    const available = items.filter(i => i.status === 'open');
    const prioritized = this.prioritize(available);
    const selected: DebtItem[] = [];
    let totalEffort = 0;

    for (const item of prioritized) {
      if (totalEffort + item.estimatedEffort <= budgetHours) {
        selected.push(item);
        totalEffort += item.estimatedEffort;
      }
    }

    return {
      sprintName,
      totalPoints: Math.round(budgetHours * 2),
      debtPoints: Math.round(totalEffort * 2),
      selectedItems: selected,
      totalEffort,
    };
  }

  private computeScore(item: DebtItem): number {
    const severityW = SEVERITY_WEIGHT[item.severity] || 1;
    const churnFactor = this.churnScores.get(item.file) || 0;
    const depFactor = this.dependencyScores.get(item.file) || 0;
    const ageDays = (Date.now() - new Date(item.detectedAt).getTime()) / 86400000;
    const ageFactor = Math.min(1, ageDays / 90);

    return severityW * (1 + churnFactor * 0.003 + depFactor * 0.002 + ageFactor * 0.1);
  }
}
