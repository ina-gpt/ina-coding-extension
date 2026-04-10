/**
 * Phase 11.2 — Feature Tour Service
 * Manages interactive feature tours with step-by-step walkthroughs.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { FeatureTour, TourStep, TourCategory } from './OnboardingTypes';
import { OnboardingManager } from './OnboardingManager';

export class FeatureTourService extends EventEmitter {
  private static instance: FeatureTourService;
  private tours = new Map<string, FeatureTour>();
  private activeTour: { tour: FeatureTour; currentStepIndex: number; startedAt: number } | null = null;

  static getInstance(): FeatureTourService {
    if (!FeatureTourService.instance) {
      FeatureTourService.instance = new FeatureTourService();
    }
    return FeatureTourService.instance;
  }

  private constructor() {
    super();
  }

  initialize(): void {
    this.registerBuiltInTours();
    Logger.info(`[Tour] Initialized with ${this.tours.size} tours`);
  }

  private registerBuiltInTours(): void {
    // Essential Features Tour
    this.tours.set('essential-features', {
      id: 'essential-features',
      name: 'Essential Features',
      description: 'Learn the core features of INA Coding in 3 minutes',
      category: TourCategory.ESSENTIAL,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'ef-1', title: 'Your AI Coding Assistant',
          description: 'This is where you chat with INA Coding. Ask questions, get code help, debug errors, and more. Everything starts here.',
          target: { type: 'panel', panelId: 'inaCoding.chatView', selector: null, commandId: null },
          highlight: { type: 'glow', color: null, borderRadius: null },
          position: 'right', action: null, canSkip: true, autoAdvanceMs: null,
          media: { type: 'svg', src: null, alt: 'Chat panel', width: null, height: null, inlineSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
        },
        {
          id: 'ef-2', title: 'Automatic Context',
          description: 'INA Coding automatically includes your current file, selection, and project context. The @ button lets you add more — try @file, @symbol, @docs, @git.',
          target: { type: 'element', selector: '.context-display', panelId: null, commandId: null },
          highlight: { type: 'pulse', color: null, borderRadius: null },
          position: 'top', action: 'Try typing @ in the chat input', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'ef-3', title: 'Edit Code Inline (Cmd+K)',
          description: 'Select code and press Cmd+K to edit it with AI. Describe what you want changed and review the diff before applying.',
          target: { type: 'editor', selector: null, panelId: null, commandId: 'inaCoding.inlineEdit' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'bottom', action: 'Select some code and press Cmd+K', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'ef-4', title: 'AI Tab Completion',
          description: 'As you type, AI suggests completions. Press Tab to accept, Escape to dismiss, Alt+] to cycle alternatives, Cmd+→ to accept word by word.',
          target: { type: 'editor', selector: null, panelId: null, commandId: null },
          highlight: { type: 'spotlight', color: null, borderRadius: null },
          position: 'bottom', action: null, canSkip: true, autoAdvanceMs: 8000, media: null,
        },
        {
          id: 'ef-5', title: 'Agent Mode for Big Tasks',
          description: 'Toggle Agent mode for multi-file edits. Describe a feature and the AI will plan, execute, and let you review all changes.',
          target: { type: 'element', selector: '.agent-toggle', panelId: null, commandId: null },
          highlight: { type: 'glow', color: null, borderRadius: null },
          position: 'bottom', action: 'Click the Agent toggle to try it', canSkip: true, autoAdvanceMs: null, media: null,
        },
      ],
    });

    // Chat Features Tour
    this.tours.set('chat-features', {
      id: 'chat-features',
      name: 'Chat Features',
      description: 'Discover all the ways to interact with INA Coding',
      category: TourCategory.CHAT,
      estimatedMinutes: 4,
      steps: [
        {
          id: 'cf-1', title: '@Mentions',
          description: 'Reference files (@file:), symbols (@symbol:), docs (@docs:), git (@git:), and more. Context is automatically included in your message.',
          target: { type: 'element', selector: '.mention-autocomplete', panelId: null, commandId: null },
          highlight: { type: 'pulse', color: null, borderRadius: null },
          position: 'top', action: 'Type @ in the chat input to see options', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'cf-2', title: 'Code Blocks',
          description: 'AI responses include code blocks with syntax highlighting. Click Copy to copy, Insert to add at cursor, or Apply to replace in file.',
          target: { type: 'area', selector: '.code-block', panelId: null, commandId: null },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'top', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'cf-3', title: 'Chat History',
          description: 'Click the History button to browse, search, pin, and export past conversations. Each conversation is preserved with full context.',
          target: { type: 'element', selector: '.history-button', panelId: null, commandId: null },
          highlight: { type: 'glow', color: null, borderRadius: null },
          position: 'bottom', action: 'Click the History button', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'cf-4', title: 'Image Support',
          description: 'Paste screenshots (Cmd+V), upload images, or capture your screen. INA can analyze UI, convert designs to code, and annotate images.',
          target: { type: 'element', selector: '.image-upload', panelId: null, commandId: null },
          highlight: { type: 'pulse', color: null, borderRadius: null },
          position: 'top', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'cf-5', title: 'Memory',
          description: 'Type "Remember that..." to save facts. Type "Forget about..." to remove them. INA recalls relevant memories in future conversations.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: 'Try: "Remember that we use Tailwind CSS in this project"', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'cf-6', title: 'Project Rules',
          description: 'Create a .ina-rules file to set coding standards, response language, and style preferences. All AI responses follow your rules.',
          target: { type: 'command', selector: null, panelId: null, commandId: 'inaCoding.rules.create' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
      ],
    });

    // Agent Mode Tour
    this.tours.set('agent-tour', {
      id: 'agent-tour',
      name: 'Agent Mode',
      description: 'Learn to use Agent mode for multi-file automated editing',
      category: TourCategory.AGENT,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'at-1', title: 'Activating Agent Mode',
          description: 'Click the Agent toggle or press Cmd+Shift+K. In Agent mode, INA plans and executes multi-file changes automatically.',
          target: { type: 'element', selector: '.agent-toggle', panelId: null, commandId: null },
          highlight: { type: 'glow', color: null, borderRadius: null },
          position: 'bottom', action: 'Toggle Agent mode', canSkip: true, autoAdvanceMs: null, media: null,
        },
        {
          id: 'at-2', title: 'Plan Generation',
          description: 'Describe what you want to build. INA generates a step-by-step plan showing each file operation, estimated risk, and affected files.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'at-3', title: 'Execution Monitoring',
          description: 'After approving the plan, watch real-time progress. Each step shows status, output, and you can pause or cancel anytime.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'at-4', title: 'Change Review',
          description: 'Review all changes after execution. Accept or reject individual files, view diffs, and add review notes before committing.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'at-5', title: 'Rollback & Undo',
          description: 'Not happy? Rollback all changes or undo specific files. Every operation is reversible until you finalize.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: null, canSkip: true, autoAdvanceMs: null, media: null,
        },
      ],
    });

    // Advanced Features Tour
    this.tours.set('advanced-features', {
      id: 'advanced-features',
      name: 'Advanced Features',
      description: 'Explore Git, LSP, documentation, search, and offline capabilities',
      category: TourCategory.ADVANCED,
      estimatedMinutes: 3,
      steps: [
        {
          id: 'af-1', title: 'Git Integration',
          description: 'Use @git:diff, @git:log, @git:blame to include git context. View status, branches, PR context, and blame information.',
          target: { type: 'command', selector: null, panelId: null, commandId: 'inaCoding.showGitPanel' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'af-2', title: 'LSP Integration',
          description: 'Use @type, @refs, @errors to include language server context. Get type info, find references, explain errors with AI.',
          target: { type: 'command', selector: null, panelId: null, commandId: 'inaCoding.showLSPContext' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'af-3', title: 'Documentation Indexing',
          description: 'Index documentation from URLs, npm packages, or local files. Then use @docs to search them with AI.',
          target: { type: 'command', selector: null, panelId: null, commandId: 'inaCoding.openDocsPanel' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'af-4', title: 'Codebase Search',
          description: 'Use semantic search to find code by meaning, not just keywords. @codebase mention searches your indexed project.',
          target: { type: 'command', selector: null, panelId: null, commandId: 'inaCoding.openSearch' },
          highlight: { type: 'border', color: null, borderRadius: null },
          position: 'center', action: null, canSkip: true, autoAdvanceMs: 6000, media: null,
        },
        {
          id: 'af-5', title: 'Offline Mode',
          description: 'When offline, INA queues requests, uses cached responses, and can fall back to a local AI model for basic tasks.',
          target: { type: 'fullscreen', selector: null, panelId: null, commandId: null },
          highlight: null,
          position: 'center', action: null, canSkip: true, autoAdvanceMs: null, media: null,
        },
      ],
    });
  }

  startTour(tourId: string): void {
    const tour = this.tours.get(tourId);
    if (!tour) { Logger.warn(`[Tour] Unknown tour: ${tourId}`); return; }
    if (tour.steps.length === 0) return;

    this.activeTour = { tour, currentStepIndex: 0, startedAt: Date.now() };
    this.emit('tour-started', tour);
    this.emit('tour-step', tour.steps[0], 0, tour.steps.length);
    Logger.info(`[Tour] Started: ${tour.name}`);
  }

  nextStep(): void {
    if (!this.activeTour) return;
    const { tour, currentStepIndex } = this.activeTour;
    const nextIdx = currentStepIndex + 1;

    if (nextIdx >= tour.steps.length) {
      this.completeTour();
      return;
    }

    this.activeTour.currentStepIndex = nextIdx;
    this.emit('tour-step', tour.steps[nextIdx], nextIdx, tour.steps.length);
  }

  previousStep(): void {
    if (!this.activeTour || this.activeTour.currentStepIndex === 0) return;
    this.activeTour.currentStepIndex--;
    const { tour, currentStepIndex } = this.activeTour;
    this.emit('tour-step', tour.steps[currentStepIndex], currentStepIndex, tour.steps.length);
  }

  skipTour(): void {
    if (!this.activeTour) return;
    const tourId = this.activeTour.tour.id;
    this.activeTour = null;
    this.emit('tour-skipped', tourId);
    Logger.info(`[Tour] Skipped: ${tourId}`);
  }

  completeTour(): void {
    if (!this.activeTour) return;
    const tour = this.activeTour.tour;
    this.activeTour = null;

    OnboardingManager.getInstance().markTourCompleted(tour.id);
    this.emit('tour-completed', tour.id);
    Logger.info(`[Tour] Completed: ${tour.name}`);
  }

  getCurrentTourStep(): TourStep | null {
    if (!this.activeTour) return null;
    return this.activeTour.tour.steps[this.activeTour.currentStepIndex] || null;
  }

  getTourProgress(): { current: number; total: number } | null {
    if (!this.activeTour) return null;
    return { current: this.activeTour.currentStepIndex + 1, total: this.activeTour.tour.steps.length };
  }

  isInTour(): boolean {
    return this.activeTour !== null;
  }

  getAvailableTours(): FeatureTour[] {
    return Array.from(this.tours.values());
  }

  getTourById(id: string): FeatureTour | null {
    return this.tours.get(id) || null;
  }

  getActiveTourId(): string | null {
    return this.activeTour?.tour.id || null;
  }

  dispose(): void {
    this.activeTour = null;
    this.removeAllListeners();
  }
}
