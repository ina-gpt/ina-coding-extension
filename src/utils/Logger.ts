import * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class LoggerClass {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = 'info';

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('INA Coding');
  }

  setLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0
      ? ' ' + args.map(a => {
          if (a instanceof Error) {
            return `${a.message}\n${a.stack}`;
          }
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ')
      : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, ...args);
      this.outputChannel.appendLine(formatted);
    }
  }

  info(message: string, ...args: unknown[]) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, ...args);
      this.outputChannel.appendLine(formatted);
    }
  }

  warn(message: string, ...args: unknown[]) {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, ...args);
      this.outputChannel.appendLine(formatted);
    }
  }

  error(message: string, ...args: unknown[]) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, ...args);
      this.outputChannel.appendLine(formatted);
    }
  }

  show() {
    this.outputChannel.show();
  }

  dispose() {
    this.outputChannel.dispose();
  }
}

export const Logger = new LoggerClass();
