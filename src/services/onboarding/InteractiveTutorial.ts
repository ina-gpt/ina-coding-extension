/**
 * Phase 11.2 — Interactive Tutorial
 * Step-by-step interactive tutorial with lessons and progress tracking.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { TutorialProgress, TutorialLesson, TutorialStep } from './OnboardingTypes';
import { OnboardingManager } from './OnboardingManager';

export class InteractiveTutorial extends EventEmitter {
  private static instance: InteractiveTutorial;
  private progress: TutorialProgress | null = null;
  private currentLesson: TutorialLesson | null = null;
  private currentStepIndex = 0;
  private lessons: TutorialLesson[] = [];

  static getInstance(): InteractiveTutorial {
    if (!InteractiveTutorial.instance) {
      InteractiveTutorial.instance = new InteractiveTutorial();
    }
    return InteractiveTutorial.instance;
  }

  private constructor() {
    super();
    this.registerLessons();
  }

  private registerLessons(): void {
    this.lessons = [
      {
        id: 'first-chat', title: 'Say Hello to INA Coding', description: 'Send your first message and get a response',
        objective: 'Send your first message and get a response',
        successCriteria: 'Message sent and response received',
        reward: '🎉 First Chat Complete!',
        steps: [
          { instruction: 'Click on the chat input box at the bottom of the panel', expectedAction: 'focus_input', hint: 'The text input is at the very bottom of the sidebar', validation: null, autoComplete: false },
          { instruction: 'Type: "What programming language is this file written in?"', expectedAction: 'type_message', hint: 'Just type any coding question — the AI will respond!', validation: null, autoComplete: false },
          { instruction: 'Press Enter or click Send to send your message', expectedAction: 'send_message', hint: 'You can also press Cmd+Enter', validation: null, autoComplete: false },
          { instruction: 'Great! Wait for the AI response...', expectedAction: 'wait_response', hint: null, validation: null, autoComplete: true },
          { instruction: 'You just had your first AI conversation! Notice how it knew about your open file.', expectedAction: 'celebrate', hint: null, validation: null, autoComplete: true },
        ],
      },
      {
        id: 'at-mentions', title: 'Reference Code with @ Mentions', description: 'Use @file and @symbol to give context',
        objective: 'Use @file mention to reference a specific file',
        successCriteria: 'Message sent with @file mention',
        reward: '📎 Context Master!',
        steps: [
          { instruction: 'Type @ in the chat input', expectedAction: 'type_at', hint: 'The @ character triggers the mention autocomplete', validation: null, autoComplete: false },
          { instruction: 'Select a file from the dropdown (or type @file:)', expectedAction: 'select_mention', hint: 'You can type to filter — try @file:package', validation: null, autoComplete: false },
          { instruction: 'Now ask: "Explain what this file does"', expectedAction: 'send_with_mention', hint: 'The full file content will be included as context', validation: null, autoComplete: false },
          { instruction: 'The AI now has the full file content as context!', expectedAction: 'celebrate', hint: null, validation: null, autoComplete: true },
        ],
      },
      {
        id: 'inline-edit', title: 'Edit Code with Cmd+K', description: 'Use inline edit to modify code',
        objective: 'Use inline edit to modify code in the editor',
        successCriteria: 'Inline edit accepted or rejected',
        reward: '✏️ Inline Editor!',
        steps: [
          { instruction: 'Open any code file in the editor', expectedAction: 'open_file', hint: 'Click on a file in the Explorer sidebar', validation: null, autoComplete: false },
          { instruction: 'Select a few lines of code', expectedAction: 'select_code', hint: 'Click and drag to select, or Shift+↓ to extend selection', validation: null, autoComplete: false },
          { instruction: 'Press Cmd+K (or Ctrl+K on Windows/Linux)', expectedAction: 'trigger_inline_edit', hint: 'This opens the inline edit prompt', validation: null, autoComplete: false },
          { instruction: 'Type an instruction like "add error handling"', expectedAction: 'type_prompt', hint: 'Be specific about what you want changed', validation: null, autoComplete: false },
          { instruction: 'Review the suggested changes — green lines are additions, red are removals', expectedAction: 'review_diff', hint: null, validation: null, autoComplete: true },
          { instruction: 'Press Cmd+Enter to accept or Cmd+Backspace to reject', expectedAction: 'accept_or_reject', hint: 'Both options are valid — you can always try again', validation: null, autoComplete: false },
        ],
      },
      {
        id: 'tab-completion', title: 'AI-Powered Autocomplete', description: 'Accept an AI code suggestion',
        objective: 'Accept an AI code completion suggestion',
        successCriteria: 'Completion accepted',
        reward: '⚡ Speed Coder!',
        steps: [
          { instruction: 'Open a code file and start typing a new function or statement', expectedAction: 'open_file', hint: 'Try typing "function " or "const " to trigger a suggestion', validation: null, autoComplete: false },
          { instruction: 'Pause typing — a gray ghost text suggestion will appear', expectedAction: 'wait_completion', hint: 'Suggestions appear after a brief pause (300ms)', validation: null, autoComplete: false },
          { instruction: 'Press Tab to accept the full suggestion', expectedAction: 'accept_completion', hint: 'The ghost text will become real code', validation: null, autoComplete: false },
          { instruction: 'Try Cmd+→ to accept word by word, or Alt+] to see alternatives', expectedAction: 'celebrate', hint: null, validation: null, autoComplete: true },
        ],
      },
      {
        id: 'project-rules', title: 'Set Up Project Rules', description: 'Create a .ina-rules file',
        objective: 'Create a .ina-rules file for your project',
        successCriteria: '.ina-rules file created',
        reward: '📋 Rules Master!',
        steps: [
          { instruction: 'Open the Command Palette (Cmd+Shift+P) and search "INA Create Rules"', expectedAction: 'open_command_palette', hint: 'Type "INA" to filter commands quickly', validation: null, autoComplete: false },
          { instruction: 'Select a template that matches your project', expectedAction: 'select_template', hint: 'Templates include TypeScript, Python, React, and more', validation: null, autoComplete: false },
          { instruction: 'The rules file is now open — customize it to your preferences!', expectedAction: 'review_rules', hint: 'Set language, code style, and response preferences', validation: null, autoComplete: true },
          { instruction: 'From now on, all AI responses will follow these rules', expectedAction: 'celebrate', hint: null, validation: null, autoComplete: true },
        ],
      },
      {
        id: 'agent-mode', title: 'Multi-File Editing with Agent', description: 'Use agent mode for automated multi-file changes',
        objective: 'Use agent mode to generate and approve a plan',
        successCriteria: 'Agent plan approved',
        reward: '🤖 Agent Commander!',
        steps: [
          { instruction: 'Click the Agent toggle in the chat header (or press Cmd+Shift+K)', expectedAction: 'toggle_agent', hint: 'The toggle switches between Chat → Agent → Auto modes', validation: null, autoComplete: false },
          { instruction: 'Describe a change that affects multiple files, e.g., "Add a loading spinner component and use it in all pages"', expectedAction: 'describe_task', hint: 'The more specific your description, the better the plan', validation: null, autoComplete: false },
          { instruction: 'Review the generated plan — each step is a file operation', expectedAction: 'review_plan', hint: 'You can click on steps to see details', validation: null, autoComplete: true },
          { instruction: 'Click "Approve & Execute" to start (or "Revise" to modify the plan)', expectedAction: 'approve_plan', hint: 'You can pause execution at any time', validation: null, autoComplete: false },
          { instruction: 'Watch the execution progress — you can pause anytime', expectedAction: 'watch_execution', hint: null, validation: null, autoComplete: true },
          { instruction: 'Review all changes — accept, reject, or undo individual files', expectedAction: 'celebrate', hint: null, validation: null, autoComplete: true },
        ],
      },
    ];
  }

  startTutorial(): void {
    this.progress = {
      currentLesson: 0,
      totalLessons: this.lessons.length,
      completedLessons: [],
      score: 0,
      startedAt: Date.now(),
    };
    this.currentLesson = null;
    this.currentStepIndex = 0;
    this.syncProgress();
    this.emit('tutorial-started', this.progress);
    Logger.info('[Tutorial] Started');
  }

  startLesson(lessonId: string): void {
    const lesson = this.lessons.find(l => l.id === lessonId);
    if (!lesson) { Logger.warn(`[Tutorial] Unknown lesson: ${lessonId}`); return; }

    this.currentLesson = lesson;
    this.currentStepIndex = 0;

    if (this.progress) {
      this.progress.currentLesson = this.lessons.indexOf(lesson);
    }

    this.syncProgress();
    this.emit('lesson-started', lesson, lesson.steps[0]);
    Logger.info(`[Tutorial] Lesson started: ${lesson.title}`);
  }

  advanceStep(): void {
    if (!this.currentLesson) return;

    this.currentStepIndex++;
    if (this.currentStepIndex >= this.currentLesson.steps.length) {
      this.completeLesson();
      return;
    }

    const step = this.currentLesson.steps[this.currentStepIndex];
    this.emit('step-advanced', this.currentLesson, step, this.currentStepIndex);
  }

  completeLesson(): void {
    if (!this.currentLesson || !this.progress) return;

    const lessonId = this.currentLesson.id;
    if (!this.progress.completedLessons.includes(lessonId)) {
      this.progress.completedLessons.push(lessonId);
      this.progress.score += 100;
    }

    const reward = this.currentLesson.reward;
    this.emit('lesson-completed', lessonId, reward);

    this.currentLesson = null;
    this.currentStepIndex = 0;

    // Check if all complete
    if (this.progress.completedLessons.length >= this.lessons.length) {
      this.completeTutorial();
    } else {
      this.syncProgress();
    }

    Logger.info(`[Tutorial] Lesson completed: ${lessonId}`);
  }

  completeTutorial(): void {
    if (!this.progress) return;
    this.emit('tutorial-completed', this.progress);
    this.syncProgress();
    Logger.info(`[Tutorial] Completed! Score: ${this.progress.score}`);
  }

  skipLesson(): void {
    if (!this.currentLesson) return;
    const lessonId = this.currentLesson.id;
    this.currentLesson = null;
    this.currentStepIndex = 0;
    this.emit('lesson-skipped', lessonId);
  }

  skipTutorial(): void {
    this.currentLesson = null;
    this.currentStepIndex = 0;
    this.emit('tutorial-skipped');
  }

  resetTutorial(): void {
    this.progress = null;
    this.currentLesson = null;
    this.currentStepIndex = 0;
    OnboardingManager.getInstance().updateTutorialProgress(null);
    this.emit('tutorial-reset');
  }

  getProgress(): TutorialProgress | null { return this.progress ? { ...this.progress } : null; }
  getCurrentLesson(): TutorialLesson | null { return this.currentLesson; }
  getCurrentStep(): TutorialStep | null {
    return this.currentLesson?.steps[this.currentStepIndex] || null;
  }
  getCurrentStepIndex(): number { return this.currentStepIndex; }
  getLessons(): TutorialLesson[] { return [...this.lessons]; }
  isLessonCompleted(lessonId: string): boolean {
    return this.progress?.completedLessons.includes(lessonId) ?? false;
  }

  private syncProgress(): void {
    OnboardingManager.getInstance().updateTutorialProgress(this.progress);
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
