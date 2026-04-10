import React from 'react';
import { Trash2, Download, Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';

interface DataInventoryItem {
  category: string;
  description: string;
  storageLocation: string;
  encrypted: boolean;
  retentionDays: number;
  purpose: string;
  canDelete: boolean;
  canExport: boolean;
  dataVolume: string;
}

interface DataInventoryTableProps {
  inventory: DataInventoryItem[];
  onDelete: (category: string) => void;
  onExport: (category: string) => void;
}

export function DataInventoryTable({ inventory, onDelete, onExport }: DataInventoryTableProps) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_80px_60px_50px] gap-1 text-[10px] font-semibold text-[var(--vscode-descriptionForeground)] px-2 py-1">
        <span>Category</span>
        <span>Retention</span>
        <span>Enc.</span>
        <span>Actions</span>
      </div>
      {inventory.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_60px_50px] gap-1 text-[10px] px-2 py-1.5 rounded hover:bg-[var(--vscode-list-hoverBackground)] items-center">
          <div>
            <div className="font-medium">{item.category}</div>
            <div className="text-[var(--vscode-descriptionForeground)]">{item.storageLocation}</div>
          </div>
          <span>{item.retentionDays > 0 ? `${item.retentionDays}d` : 'Permanent'}</span>
          <span>{item.encrypted ? <Lock size={10} className="text-[var(--ina-status-success,#22c55e)]" /> : <Unlock size={10} className="text-[var(--ina-status-warning,#eab308)]" />}</span>
          <div className="flex gap-1">
            {item.canDelete && <button onClick={() => onDelete(item.category)} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Delete"><Trash2 size={10} /></button>}
            {item.canExport && <button onClick={() => onExport(item.category)} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Export"><Download size={10} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}
