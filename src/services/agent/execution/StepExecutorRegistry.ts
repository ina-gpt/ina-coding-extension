import { StepExecutor } from './ExecutionTypes';
import { CreateFileExecutor } from './executors/CreateFileExecutor';
import { EditFileExecutor } from './executors/EditFileExecutor';
import { DeleteFileExecutor } from './executors/DeleteFileExecutor';
import { RenameFileExecutor } from './executors/RenameFileExecutor';
import { TerminalExecutor } from './executors/TerminalExecutor';
import { TestExecutor } from './executors/TestExecutor';

export class StepExecutorRegistry {
  private static instance: StepExecutorRegistry;
  private executors: Map<string, StepExecutor> = new Map();

  static getInstance(): StepExecutorRegistry {
    if (!StepExecutorRegistry.instance) {
      StepExecutorRegistry.instance = new StepExecutorRegistry();
    }
    return StepExecutorRegistry.instance;
  }

  registerExecutor(type: string, executor: StepExecutor): void {
    this.executors.set(type, executor);
  }

  getExecutor(type: string): StepExecutor | null {
    return this.executors.get(type) || null;
  }

  hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }

  getAvailableTypes(): string[] {
    return [...this.executors.keys()];
  }

  registerDefaults(): void {
    this.registerExecutor('create', new CreateFileExecutor());
    this.registerExecutor('edit', new EditFileExecutor());
    this.registerExecutor('delete', new DeleteFileExecutor());
    this.registerExecutor('rename', new RenameFileExecutor());
    this.registerExecutor('move', new RenameFileExecutor());
    this.registerExecutor('terminal', new TerminalExecutor());
    this.registerExecutor('test', new TestExecutor());
  }
}
