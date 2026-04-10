import React from 'react';
import { Download, Settings, CheckCircle, AlertCircle } from 'lucide-react';

interface LocalModelStatusProps {
  isAvailable: boolean;
  models: { name: string; size: string }[];
  selectedModel: string | null;
  downloadSuggestion: { modelName: string; size: string; command: string } | null;
  onDownload?: (modelName: string) => void;
  downloadProgress?: { progress: number; status: string } | null;
}

export function LocalModelStatus({ isAvailable, models, selectedModel, downloadSuggestion, onDownload, downloadProgress }: LocalModelStatusProps) {
  if (downloadProgress && downloadProgress.progress < 100) {
    return (
      <div className="p-2 rounded bg-[var(--vscode-inputValidation-infoBackground)] text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <Download size={14} className="animate-bounce" />
          <span>Downloading model...</span>
        </div>
        <div className="w-full bg-black/20 rounded-full h-1.5">
          <div className="bg-[var(--ina-status-info,#3b82f6)] h-1.5 rounded-full transition-all" style={{ width: `${downloadProgress.progress}%` }} />
        </div>
        <div className="text-[var(--vscode-descriptionForeground)]">{downloadProgress.status} ({downloadProgress.progress}%)</div>
      </div>
    );
  }

  if (isAvailable) {
    return (
      <div className="flex items-center gap-2 p-2 rounded bg-[var(--ina-status-success-bg,rgba(34,197,94,0.1))] text-xs">
        <CheckCircle size={14} className="text-[var(--ina-status-success,#22c55e)]" />
        <div>
          <div className="font-medium text-[var(--ina-status-success,#4ade80)]">Local model ready: {selectedModel}</div>
          <div className="text-[var(--vscode-descriptionForeground)]">Responses available offline (reduced quality)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))] text-xs">
      <AlertCircle size={14} className="text-[var(--ina-status-warning,#eab308)]" />
      <div className="flex-1">
        <div className="font-medium text-[var(--ina-status-warning,#facc15)]">No local model installed</div>
        {downloadSuggestion && (
          <div className="text-[var(--vscode-descriptionForeground)]">
            Install for offline AI: {downloadSuggestion.modelName} ({downloadSuggestion.size})
          </div>
        )}
      </div>
      {downloadSuggestion && onDownload && (
        <button
          onClick={() => onDownload(downloadSuggestion.modelName)}
          className="px-2 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90 flex items-center gap-1"
        >
          <Download size={12} /> Download
        </button>
      )}
    </div>
  );
}
