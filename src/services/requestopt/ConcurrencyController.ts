import { RequestCategory, RequestPriority, CATEGORY_DEFAULTS } from './RequestOptTypes';

interface WaitingEntry {
  requestId: string;
  category: RequestCategory;
  resolve: () => void;
  priority: RequestPriority;
}

export class ConcurrencyController {
  private static instance: ConcurrencyController;
  private activeByCategory: Map<RequestCategory, Set<string>> = new Map();
  private globalActive: number = 0;
  private globalMax: number = 15;
  private waitingForSlot: WaitingEntry[] = [];

  static getInstance(): ConcurrencyController {
    if (!ConcurrencyController.instance) {
      ConcurrencyController.instance = new ConcurrencyController();
    }
    return ConcurrencyController.instance;
  }

  async acquireSlot(category: RequestCategory, requestId: string, priority: RequestPriority): Promise<void> {
    const maxForCategory = CATEGORY_DEFAULTS[category]?.maxConcurrent ?? 3;
    const active = this.getActiveSet(category);

    if (active.size < maxForCategory && this.globalActive < this.globalMax) {
      active.add(requestId);
      this.globalActive++;
      return;
    }

    // Wait for a slot
    return new Promise<void>(resolve => {
      const entry: WaitingEntry = { requestId, category, resolve, priority };
      // Insert sorted by priority (lower number = higher priority)
      const idx = this.waitingForSlot.findIndex(w => w.priority > priority);
      if (idx >= 0) {
        this.waitingForSlot.splice(idx, 0, entry);
      } else {
        this.waitingForSlot.push(entry);
      }
    });
  }

  releaseSlot(category: RequestCategory, requestId: string): void {
    const active = this.activeByCategory.get(category);
    if (active?.delete(requestId)) {
      this.globalActive--;
    }
    this.grantWaitingSlot();
  }

  getAvailableSlots(category: RequestCategory): number {
    const max = CATEGORY_DEFAULTS[category]?.maxConcurrent ?? 3;
    const active = this.activeByCategory.get(category)?.size ?? 0;
    return Math.max(0, max - active);
  }

  getActiveCount(category?: RequestCategory): number {
    if (category) return this.activeByCategory.get(category)?.size ?? 0;
    return this.globalActive;
  }

  getWaitingCount(category?: RequestCategory): number {
    if (category) return this.waitingForSlot.filter(w => w.category === category).length;
    return this.waitingForSlot.length;
  }

  getSlotUtilization(): Record<string, { active: number; max: number; waiting: number; utilization: number }> {
    const result: Record<string, any> = {};
    for (const cat of Object.values(RequestCategory)) {
      const max = CATEGORY_DEFAULTS[cat]?.maxConcurrent ?? 3;
      const active = this.activeByCategory.get(cat)?.size ?? 0;
      const waiting = this.waitingForSlot.filter(w => w.category === cat).length;
      result[cat] = { active, max, waiting, utilization: max > 0 ? active / max : 0 };
    }
    return result;
  }

  setGlobalMax(max: number): void {
    this.globalMax = max;
  }

  private getActiveSet(category: RequestCategory): Set<string> {
    let set = this.activeByCategory.get(category);
    if (!set) {
      set = new Set();
      this.activeByCategory.set(category, set);
    }
    return set;
  }

  private grantWaitingSlot(): void {
    for (let i = 0; i < this.waitingForSlot.length; i++) {
      const entry = this.waitingForSlot[i];
      const maxForCat = CATEGORY_DEFAULTS[entry.category]?.maxConcurrent ?? 3;
      const active = this.getActiveSet(entry.category);

      if (active.size < maxForCat && this.globalActive < this.globalMax) {
        this.waitingForSlot.splice(i, 1);
        active.add(entry.requestId);
        this.globalActive++;
        entry.resolve();
        return;
      }
    }
  }

  dispose(): void {
    for (const entry of this.waitingForSlot) {
      entry.resolve(); // unblock waiting
    }
    this.waitingForSlot = [];
    this.activeByCategory.clear();
    this.globalActive = 0;
  }
}
