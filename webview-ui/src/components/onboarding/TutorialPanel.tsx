import React from 'react';
import { CheckCircle2, Lock, ChevronRight, X, HelpCircle, ArrowRight } from 'lucide-react';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface TutorialLessonView {
  id: string;
  title: string;
  description: string;
  objective: string;
  steps: { instruction: string; expectedAction: string; hint: string | null; autoComplete: boolean }[];
  successCriteria: string;
  reward: string | null;
}

interface TutorialProgressView {
  currentLesson: number;
  totalLessons: number;
  completedLessons: string[];
  score: number;
  startedAt: number;
}

interface TutorialPanelProps {
  lesson: TutorialLessonView | null;
  lessonStepIndex: number;
  progress: TutorialProgressView | null;
  lessons: TutorialLessonView[];
  onStartLesson: (id: string) => void;
  onAdvanceStep: () => void;
  onSkipLesson: () => void;
  onSkipTutorial: () => void;
  onClose: () => void;
}

export function TutorialPanel({ lesson, lessonStepIndex, progress, lessons, onStartLesson, onAdvanceStep, onSkipLesson, onSkipTutorial, onClose }: TutorialPanelProps) {
  const completedCount = progress?.completedLessons.length ?? 0;
  const totalCount = lessons.length;
  const isAllComplete = completedCount >= totalCount;

  // Active lesson view
  if (lesson) {
    const step = lesson.steps[lessonStepIndex];
    const isLastStep = lessonStepIndex >= lesson.steps.length - 1;

    return (
      <div className="p-3 space-y-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50">
        {/* Lesson header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--ina-accent-primary,#3b82f6)] font-medium">
              Lesson {(progress?.currentLesson ?? 0) + 1}/{totalCount}
            </div>
            <div className="text-sm font-semibold">{lesson.title}</div>
          </div>
          <button onClick={onSkipLesson} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">
            <X size={14} />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex gap-1">
          {lesson.steps.map((_, i) => (
            <div key={i} className={clsx('flex-1 h-1 rounded-full transition-all',
              i < lessonStepIndex ? 'bg-[var(--ina-status-success,#22c55e)]' : i === lessonStepIndex ? 'bg-[var(--ina-accent-primary,#3b82f6)]' : 'bg-[var(--vscode-descriptionForeground)] opacity-20')} />
          ))}
        </div>

        {/* Current step */}
        {step && (
          <div className="rounded-lg bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] p-3 space-y-2">
            <p className="text-sm">{step.instruction}</p>
            {step.hint && (
              <div className="flex items-start gap-1.5 text-xs text-[var(--vscode-descriptionForeground)]">
                <HelpCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>{step.hint}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button onClick={onSkipLesson} className="text-xs text-[var(--vscode-descriptionForeground)] hover:underline">
            Skip lesson
          </button>
          <button onClick={onAdvanceStep}
            className="px-3 py-1.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-xs font-medium flex items-center gap-1 hover:opacity-90 transition-opacity">
            {isLastStep ? 'Complete' : "I did it!"} <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Tutorial complete
  if (isAllComplete) {
    return (
      <div className="p-4 space-y-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-center">
        <div className="text-2xl">🎓</div>
        <div className="text-sm font-semibold">Tutorial Complete!</div>
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">
          Score: {progress?.score ?? 0} • {completedCount} lessons completed
        </div>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-xs font-medium hover:opacity-90 transition-opacity">
          Start Coding!
        </button>
      </div>
    );
  }

  // Lesson list
  return (
    <div className="p-3 space-y-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Interactive Tutorial</div>
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">{completedCount}/{totalCount} lessons complete</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[var(--vscode-descriptionForeground)] opacity-20">
        <div className="h-full rounded-full bg-[var(--ina-accent-primary,#3b82f6)] transition-all"
          style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }} />
      </div>

      {/* Lessons */}
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {lessons.map((l, i) => {
          const completed = progress?.completedLessons.includes(l.id);
          const isCurrent = !completed && i <= completedCount;

          return (
            <button key={l.id} onClick={() => isCurrent ? onStartLesson(l.id) : undefined}
              disabled={!isCurrent && !completed}
              className={clsx('w-full flex items-center gap-3 p-2.5 rounded-lg text-left text-xs transition-colors',
                completed ? 'opacity-60' : isCurrent ? 'hover:bg-[var(--vscode-list-hoverBackground)] border border-[var(--ina-accent-primary,#3b82f6)]/30' : 'opacity-40 cursor-not-allowed',
                'bg-[var(--vscode-input-background)]')}>
              <span className="flex-shrink-0">
                {completed ? <CheckCircle2 size={16} className="text-[var(--ina-status-success,#22c55e)]" /> :
                 isCurrent ? <span className="w-4 h-4 rounded-full bg-[var(--ina-accent-primary,#3b82f6)] flex items-center justify-center text-[10px] text-[var(--ina-accent-primary-text,#fff)] font-bold">{i + 1}</span> :
                 <Lock size={14} className="text-[var(--vscode-descriptionForeground)]" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className={clsx('font-medium', completed && 'line-through')}>{l.title}</div>
                <div className="text-[var(--vscode-descriptionForeground)] truncate">{l.objective}</div>
              </div>
              {isCurrent && <ChevronRight size={14} />}
            </button>
          );
        })}
      </div>

      {/* Skip */}
      <div className="text-center">
        <button onClick={onSkipTutorial} className="text-xs text-[var(--vscode-descriptionForeground)] hover:underline">
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}
