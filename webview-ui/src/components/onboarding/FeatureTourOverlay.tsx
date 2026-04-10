import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import clsx from 'clsx';
import DOMPurify from 'dompurify';

// SECURITY: SVG content from tour steps is bundled from trusted sources,
// but we still sanitize as defence-in-depth before rendering.
const TOUR_SVG_ALLOWED_TAGS = ['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'use', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'ellipse'];
const TOUR_SVG_ALLOWED_ATTRS = ['xmlns', 'viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'class', 'id', 'offset', 'stop-color', 'stop-opacity', 'opacity', 'clip-path', 'mask'];

interface TourStepData {
  id: string;
  title: string;
  description: string;
  action: string | null;
  position: string;
  highlight: { type: string; color: string | null } | null;
  media: { type: string; inlineSvg: string | null; alt: string } | null;
  canSkip: boolean;
}

interface FeatureTourOverlayProps {
  step: TourStepData;
  stepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

export function FeatureTourOverlay({ step, stepNumber, totalSteps, onNext, onPrev, onSkip, onComplete }: FeatureTourOverlayProps) {
  const [visible, setVisible] = useState(false);
  const isLast = stepNumber >= totalSteps;
  const isFirst = stepNumber <= 1;

  // SECURITY: sanitize inline SVG before rendering via dangerouslySetInnerHTML
  const sanitizedSvg = useMemo(() => {
    if (!step.media?.inlineSvg) return '';
    return DOMPurify.sanitize(step.media.inlineSvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOWED_TAGS: TOUR_SVG_ALLOWED_TAGS,
      ALLOWED_ATTR: TOUR_SVG_ALLOWED_ATTRS,
      FORBID_TAGS: ['script', 'foreignObject', 'iframe'],
      FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur'],
    });
  }, [step.media?.inlineSvg]);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, [step.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { isLast ? onComplete() : onNext(); }
      else if (e.key === 'ArrowLeft' && !isFirst) { onPrev(); }
      else if (e.key === 'Escape') { onSkip(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLast, isFirst, onNext, onPrev, onSkip, onComplete]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--vscode-editor-background)]">
        <div className="h-full bg-[var(--ina-accent-primary,#3b82f6)] transition-all duration-500 ease-out"
          style={{ width: `${(stepNumber / totalSteps) * 100}%` }} />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onSkip} />

      {/* Tooltip Card */}
      <div className={clsx(
        'absolute left-1/2 -translate-x-1/2 w-[90%] max-w-sm rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl transition-all duration-300',
        step.position === 'top' || step.position === 'center' ? 'top-1/3' : 'bottom-1/4',
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      )}>
        {/* Step indicator */}
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className={clsx('h-1.5 rounded-full transition-all',
                i + 1 === stepNumber ? 'w-4 bg-[var(--ina-accent-primary,#3b82f6)]' : i + 1 < stepNumber ? 'w-1.5 bg-[var(--ina-accent-primary,#3b82f6)] opacity-40' : 'w-1.5 bg-[var(--vscode-descriptionForeground)] opacity-20')} />
            ))}
          </div>
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {stepNumber} of {totalSteps}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Media */}
          {sanitizedSvg && (
            <div className="w-10 h-10 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)]/10 flex items-center justify-center text-[var(--ina-accent-primary,#3b82f6)]"
              dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
          )}

          {/* Content */}
          <div>
            <h3 className="font-semibold text-sm">{step.title}</h3>
            <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 leading-relaxed">{step.description}</p>
          </div>

          {/* Action hint */}
          {step.action && (
            <div className="text-xs italic text-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/5 px-3 py-2 rounded-lg">
              👉 {step.action}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={onSkip} className="text-xs text-[var(--vscode-descriptionForeground)] hover:underline">
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-[var(--vscode-list-hoverBackground)] transition-colors">
                  <ChevronLeft size={16} />
                </button>
              )}
              <button onClick={isLast ? onComplete : onNext}
                className="px-4 py-1.5 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-xs font-medium flex items-center gap-1 hover:opacity-90 transition-opacity">
                {isLast ? 'Finish' : 'Next'} {!isLast && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
