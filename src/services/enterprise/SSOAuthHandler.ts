/**
 * Phase 13.4 — SSO Authentication Handler
 * Handles SSO login flow from the extension side.
 */
import * as vscode from 'vscode';
import { EnterpriseClient } from './EnterpriseClient';
import { ApiKeyStore } from '../access/ApiKeyStore';
import { Logger } from '../../utils/Logger';

export class SSOAuthHandler {
  private static instance: SSOAuthHandler;
  private isSSO = false;

  private constructor() {}

  static getInstance(): SSOAuthHandler {
    if (!SSOAuthHandler.instance) {
      SSOAuthHandler.instance = new SSOAuthHandler();
    }
    return SSOAuthHandler.instance;
  }

  async loginWithSSO(providerId: string): Promise<boolean> {
    try {
      const client = EnterpriseClient.getInstance();
      const { authUrl } = await client.initiateSSOLogin(providerId);
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));
      vscode.window.showInformationMessage('SSO login initiated. Complete authentication in your browser.');
      return true;
    } catch (error: any) {
      Logger.error('SSO login failed:', error);
      vscode.window.showErrorMessage(`SSO login failed: ${error.message}`);
      return false;
    }
  }

  async handleCallback(uri: vscode.Uri): Promise<void> {
    try {
      const params = new URLSearchParams(uri.query);
      const token = params.get('token');
      if (!token) {
        vscode.window.showErrorMessage('SSO callback missing token');
        return;
      }
      const keyStore = ApiKeyStore.getInstance();
      await keyStore.storeKey(token);
      this.isSSO = true;
      vscode.window.showInformationMessage('SSO login successful!');
      Logger.info('SSO authentication completed');
    } catch (error: any) {
      Logger.error('SSO callback handling failed:', error);
      vscode.window.showErrorMessage(`SSO callback failed: ${error.message}`);
    }
  }

  async logout(): Promise<void> {
    try {
      const keyStore = ApiKeyStore.getInstance();
      await keyStore.deleteKey();
      this.isSSO = false;
      vscode.window.showInformationMessage('Logged out from SSO.');
    } catch (error: any) {
      Logger.error('SSO logout failed:', error);
    }
  }

  isAuthenticatedViaSSO(): boolean {
    return this.isSSO;
  }

  registerURIHandler(): vscode.Disposable {
    return vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        if (uri.path === '/sso-callback') {
          await this.handleCallback(uri);
        }
      },
    });
  }
}
