/**
 * CRDTEngine.ts — Phase 20 Step 20.5
 * Logoot-based CRDT for conflict-free real-time collaborative editing
 */

import { Logger } from '../../utils/Logger';

export interface LogootPosition {
  digits: { value: number; siteId: string }[];
}

export interface CRDTOperation {
  type: 'insert' | 'delete';
  position: LogootPosition;
  character: string;
  siteId: string;
  timestamp: number;
  lamportClock: number;
}

interface CRDTAtom {
  position: LogootPosition;
  character: string;
  deleted: boolean;
  siteId: string;
}

export class CRDTEngine {
  private atoms: CRDTAtom[] = [];
  private siteId: string;
  private lamportClock = 0;
  private pendingOps: CRDTOperation[] = [];

  constructor(siteId: string) {
    this.siteId = siteId;
    // Initialize with boundary positions
    this.atoms.push({ position: { digits: [{ value: 0, siteId: '' }] }, character: '', deleted: false, siteId: '' });
    this.atoms.push({ position: { digits: [{ value: 65535, siteId: '' }] }, character: '', deleted: false, siteId: '' });
  }

  insert(index: number, text: string): CRDTOperation[] {
    const ops: CRDTOperation[] = [];
    for (let i = 0; i < text.length; i++) {
      const visibleIndex = this.toAtomIndex(index + i);
      const posBefore = this.atoms[visibleIndex]?.position || this.atoms[0].position;
      const posAfter = this.atoms[visibleIndex + 1]?.position || this.atoms[this.atoms.length - 1].position;
      const newPos = this.generatePosition(posBefore, posAfter);
      this.lamportClock++;

      const op: CRDTOperation = { type: 'insert', position: newPos, character: text[i], siteId: this.siteId, timestamp: Date.now(), lamportClock: this.lamportClock };
      this.applyLocal(op);
      ops.push(op);
    }
    return ops;
  }

  delete(index: number, count: number): CRDTOperation[] {
    const ops: CRDTOperation[] = [];
    for (let i = 0; i < count; i++) {
      const atomIndex = this.toAtomIndex(index);
      if (atomIndex >= 0 && atomIndex < this.atoms.length) {
        const atom = this.atoms[atomIndex];
        if (!atom.deleted) {
          this.lamportClock++;
          const op: CRDTOperation = { type: 'delete', position: atom.position, character: atom.character, siteId: this.siteId, timestamp: Date.now(), lamportClock: this.lamportClock };
          atom.deleted = true;
          ops.push(op);
        }
      }
    }
    return ops;
  }

  merge(remoteOps: CRDTOperation[]): { applied: number; conflicts: number } {
    let applied = 0, conflicts = 0;
    for (const op of remoteOps) {
      this.lamportClock = Math.max(this.lamportClock, op.lamportClock) + 1;
      try {
        if (op.type === 'insert') {
          const insertIdx = this.findInsertIndex(op.position);
          if (insertIdx >= 0) {
            this.atoms.splice(insertIdx, 0, { position: op.position, character: op.character, deleted: false, siteId: op.siteId });
            applied++;
          } else {
            conflicts++;
          }
        } else if (op.type === 'delete') {
          const atom = this.findAtom(op.position);
          if (atom && !atom.deleted) {
            atom.deleted = true;
            applied++;
          }
        }
      } catch {
        conflicts++;
      }
    }
    return { applied, conflicts };
  }

  getText(): string {
    return this.atoms.filter(a => !a.deleted && a.character).map(a => a.character).join('');
  }

  getState(): { atoms: CRDTAtom[]; clock: number } {
    return { atoms: [...this.atoms], clock: this.lamportClock };
  }

  loadState(state: { atoms: CRDTAtom[]; clock: number }): void {
    this.atoms = state.atoms;
    this.lamportClock = state.clock;
  }

  bufferOp(op: CRDTOperation): void {
    this.pendingOps.push(op);
  }

  flushPending(): CRDTOperation[] {
    const ops = [...this.pendingOps];
    this.pendingOps = [];
    return ops;
  }

  garbageCollect(): number {
    const before = this.atoms.length;
    this.atoms = this.atoms.filter(a => !a.deleted || a.character === '');
    return before - this.atoms.length;
  }

  private applyLocal(op: CRDTOperation): void {
    if (op.type === 'insert') {
      const idx = this.findInsertIndex(op.position);
      this.atoms.splice(idx, 0, { position: op.position, character: op.character, deleted: false, siteId: op.siteId });
    }
  }

  private generatePosition(before: LogootPosition, after: LogootPosition): LogootPosition {
    const digits: { value: number; siteId: string }[] = [];
    const maxLen = Math.max(before.digits.length, after.digits.length);

    for (let i = 0; i < maxLen + 1; i++) {
      const b = before.digits[i]?.value ?? 0;
      const a = after.digits[i]?.value ?? 65535;

      if (a - b > 1) {
        const mid = b + 1 + Math.floor(Math.random() * Math.min(10, a - b - 1));
        digits.push({ value: mid, siteId: this.siteId });
        break;
      } else {
        digits.push({ value: b, siteId: before.digits[i]?.siteId || this.siteId });
      }
    }

    if (digits.length === 0) {
      digits.push({ value: 32768, siteId: this.siteId });
    }

    return { digits };
  }

  private comparePositions(a: LogootPosition, b: LogootPosition): number {
    const maxLen = Math.max(a.digits.length, b.digits.length);
    for (let i = 0; i < maxLen; i++) {
      const av = a.digits[i]?.value ?? 0;
      const bv = b.digits[i]?.value ?? 0;
      if (av !== bv) return av - bv;
      const as = a.digits[i]?.siteId ?? '';
      const bs = b.digits[i]?.siteId ?? '';
      if (as !== bs) return as < bs ? -1 : 1;
    }
    return 0;
  }

  private findInsertIndex(position: LogootPosition): number {
    let lo = 0, hi = this.atoms.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.comparePositions(this.atoms[mid].position, position) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private findAtom(position: LogootPosition): CRDTAtom | null {
    for (const atom of this.atoms) {
      if (this.comparePositions(atom.position, position) === 0) return atom;
    }
    return null;
  }

  private toAtomIndex(visibleIndex: number): number {
    let count = -1; // Skip first boundary
    for (let i = 0; i < this.atoms.length; i++) {
      if (!this.atoms[i].deleted && this.atoms[i].character) count++;
      if (count === visibleIndex) return i;
    }
    return this.atoms.length - 1;
  }
}
