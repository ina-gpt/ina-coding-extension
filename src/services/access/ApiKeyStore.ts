/**
 * Phase 12.2 — API Key Store
 * Secure key storage using VS Code SecretStorage.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { EditorCompat } from '../compat/EditorCompat';

const SECRET_KEY = 'inaCoding.apiKey';

export class ApiKeyStore {
  private static instance: ApiKeyStore | null = null;
  private context: vscode.ExtensionContext | null = null;

  static getInstance(): ApiKeyStore {
    if (!ApiKeyStore.instance) {
      ApiKeyStore.instance = new ApiKeyStore();
    }
    return ApiKeyStore.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    Logger.info('ApiKeyStore initialized');
  }

  private get compat(): EditorCompat {
    return EditorCompat.getInstance();
  }

  async storeKey(key: string): Promise<void> {
    if (!this.context) throw new Error('ApiKeyStore not initialized');
    await this.compat.setSecret(this.context, SECRET_KEY, key);
    Logger.info('API key stored in SecretStorage');
  }

  async getKey(): Promise<string | null> {
    if (!this.context) throw new Error('ApiKeyStore not initialized');
    const key = await this.compat.getSecret(this.context, SECRET_KEY);
    return key || null;
  }

  async deleteKey(): Promise<void> {
    if (!this.context) throw new Error('ApiKeyStore not initialized');
    await this.compat.deleteSecret(this.context, SECRET_KEY);
    Logger.info('API key removed from SecretStorage');
  }

  async hasKey(): Promise<boolean> {
    if (!this.context) return false;
    const key = await this.compat.getSecret(this.context, SECRET_KEY);
    return !!key;
  }

  async promptForKey(): Promise<string | null> {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your INA Coding API key (ina_xxx...)',
      placeHolder: 'ina_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      password: true,
      validateInput: (value: string) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('ina_')) return 'Key must start with "ina_"';
        if (value.length !== 68) return 'Key must be 68 characters long';
        return null;
      },
    });

    if (key) {
      await this.storeKey(key);
      vscode.window.showInformationMessage('API key saved securely.');
      return key;
    }
    return null;
  }

  async showKeySetupFlow(): Promise<boolean> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Enter API Key', description: 'I have an API key to enter' },
        { label: 'Skip for Now', description: 'Continue without an API key' },
      ],
      {
        placeHolder: 'Set up your INA Coding API key for secure access',
        title: 'INA Coding - API Key Setup',
      }
    );

    if (!choice) return false;

    if (choice.label === 'Enter API Key') {
      const key = await this.promptForKey();
      return !!key;
    }

    return false;
  }

  async rotateKey(accessClient: any): Promise<string | null> {
    const currentKey = await this.getKey();
    if (!currentKey) {
      vscode.window.showWarningMessage('No current API key to rotate.');
      return null;
    }

    try {
      const result = await accessClient.rotateKey(currentKey);
      if (result?.key) {
        await this.storeKey(result.key);
        vscode.window.showInformationMessage('API key rotated successfully.');
        return result.key;
      }
    } catch (error: any) {
      Logger.error('Key rotation failed', error);
      vscode.window.showErrorMessage(`Key rotation failed: ${error.message}`);
    }
    return null;
  }
}
