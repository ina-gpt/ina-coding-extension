import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
}

type AuthStateListener = (state: AuthState) => void;

const CALLBACK_PATH = '/callback';
const TOKEN_REFRESH_BUFFER = 60 * 1000;

export class AuthService {
  private context: vscode.ExtensionContext;
  private _state: AuthState = { isAuthenticated: false, user: null, tokens: null };
  private listeners: Set<AuthStateListener> = new Set();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private codeVerifier: string | null = null;
  private codeChallenge: string | null = null;
  private authState: string | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadStoredAuth();
    this.registerUriHandler();
  }

  get isAuthenticated(): boolean {
    return this._state.isAuthenticated;
  }

  get user(): User | null {
    return this._state.user;
  }

  get accessToken(): string | null {
    return this._state.tokens?.accessToken || null;
  }

  getState(): AuthState {
    return { ...this._state };
  }

  onChange(listener: AuthStateListener): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  // ============ Sign In Flow ============

  async signIn(): Promise<boolean> {
    try {
      Logger.info('Starting sign in flow...');

      this.codeVerifier = this.generateRandomString(64);
      this.codeChallenge = crypto.createHash('sha256').update(this.codeVerifier).digest('base64url');
      this.authState = this.generateRandomString(32);

      const apiEndpoint = ConfigManager.getApiEndpoint();
      const redirectUri = `vscode://inagpt.ina-coding${CALLBACK_PATH}`;

      const authUrl = new URL(`${apiEndpoint}/api/auth/authorize`);
      authUrl.searchParams.set('client_id', 'vscode');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('code_challenge', this.codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', this.authState);

      const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
      if (!opened) {
        throw new Error('Failed to open browser');
      }

      vscode.window.showInformationMessage(
        'Please complete sign in in your browser...',
        'Cancel'
      ).then((selection) => {
        if (selection === 'Cancel') {
          this.codeVerifier = null;
          this.codeChallenge = null;
          this.authState = null;
        }
      });

      return true;
    } catch (error) {
      Logger.error('Sign in failed:', error);
      vscode.window.showErrorMessage(
        `Sign in failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  async handleCallback(code: string, state: string): Promise<boolean> {
    try {
      if (state !== this.authState) {
        throw new Error('Invalid state parameter');
      }
      if (!this.codeVerifier) {
        throw new Error('No code verifier found');
      }

      Logger.info('Exchanging authorization code for tokens...');

      const apiEndpoint = ConfigManager.getApiEndpoint();
      const redirectUri = `vscode://inagpt.ina-coding${CALLBACK_PATH}`;

      const response = await fetch(`${apiEndpoint}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: this.codeVerifier,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error_description || 'Token exchange failed');
      }

      const data = await response.json();

      const tokens: AuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      const user: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatarUrl: data.user.avatar_url,
        plan: data.user.plan,
      };

      await this.setAuthState(true, user, tokens);

      this.codeVerifier = null;
      this.codeChallenge = null;
      this.authState = null;

      this.scheduleTokenRefresh();

      Logger.info('Sign in successful:', user.email);
      vscode.window.showInformationMessage(`Welcome, ${user.name || user.email}!`);

      return true;
    } catch (error) {
      Logger.error('Callback handling failed:', error);
      vscode.window.showErrorMessage(
        `Sign in failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  // ============ Sign Out ============

  async signOut(): Promise<void> {
    try {
      if (this._state.tokens?.refreshToken) {
        const apiEndpoint = ConfigManager.getApiEndpoint();
        await fetch(`${apiEndpoint}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: this._state.tokens.refreshToken }),
        }).catch(() => { /* ignore */ });
      }
    } catch (error) {
      Logger.warn('Failed to revoke token:', error);
    }

    await this.setAuthState(false, null, null);
    this.clearTokenRefresh();

    Logger.info('Signed out');
    vscode.window.showInformationMessage('Signed out of INA Coding');
  }

  // ============ Token Refresh ============

  async refreshTokens(): Promise<boolean> {
    if (!this._state.tokens?.refreshToken) { return false; }

    try {
      Logger.info('Refreshing access token...');

      const apiEndpoint = ConfigManager.getApiEndpoint();
      const response = await fetch(`${apiEndpoint}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this._state.tokens.refreshToken,
        }),
      });

      if (!response.ok) { throw new Error('Token refresh failed'); }

      const data = await response.json();

      const tokens: AuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      const user: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        avatarUrl: data.user.avatar_url,
        plan: data.user.plan,
      };

      await this.setAuthState(true, user, tokens);
      this.scheduleTokenRefresh();

      Logger.info('Token refreshed successfully');
      return true;
    } catch (error) {
      Logger.error('Token refresh failed:', error);
      await this.setAuthState(false, null, null);
      vscode.window.showWarningMessage('Session expired. Please sign in again.');
      return false;
    }
  }

  private scheduleTokenRefresh() {
    this.clearTokenRefresh();
    if (!this._state.tokens) { return; }

    const expiresIn = this._state.tokens.expiresAt - Date.now() - TOKEN_REFRESH_BUFFER;

    if (expiresIn > 0) {
      this.refreshTimer = setTimeout(() => { this.refreshTokens(); }, expiresIn);
      Logger.debug(`Token refresh scheduled in ${Math.round(expiresIn / 1000)}s`);
    } else {
      this.refreshTokens();
    }
  }

  private clearTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ============ Storage ============

  private async loadStoredAuth() {
    try {
      const accessToken = await this.context.secrets.get('inaCoding.accessToken');
      const refreshToken = await this.context.secrets.get('inaCoding.refreshToken');
      const expiresAtStr = await this.context.secrets.get('inaCoding.expiresAt');
      const userJson = await this.context.secrets.get('inaCoding.user');

      if (accessToken && refreshToken && userJson) {
        const user = JSON.parse(userJson) as User;
        const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

        if (expiresAt > Date.now()) {
          this._state = { isAuthenticated: true, user, tokens: { accessToken, refreshToken, expiresAt } };
          this.scheduleTokenRefresh();
          Logger.info('Restored auth session for:', user.email);
        } else if (refreshToken) {
          this._state = { isAuthenticated: false, user: null, tokens: { accessToken, refreshToken, expiresAt } };
          await this.refreshTokens();
        }
      }
    } catch (error) {
      Logger.warn('Failed to load stored auth:', error);
    }

    vscode.commands.executeCommand('setContext', 'inaCoding.isAuthenticated', this._state.isAuthenticated);
  }

  private async setAuthState(isAuthenticated: boolean, user: User | null, tokens: AuthTokens | null) {
    this._state = { isAuthenticated, user, tokens };

    if (tokens) {
      await this.context.secrets.store('inaCoding.accessToken', tokens.accessToken);
      await this.context.secrets.store('inaCoding.refreshToken', tokens.refreshToken);
      await this.context.secrets.store('inaCoding.expiresAt', tokens.expiresAt.toString());
    } else {
      await this.context.secrets.delete('inaCoding.accessToken');
      await this.context.secrets.delete('inaCoding.refreshToken');
      await this.context.secrets.delete('inaCoding.expiresAt');
    }

    if (user) {
      await this.context.secrets.store('inaCoding.user', JSON.stringify(user));
    } else {
      await this.context.secrets.delete('inaCoding.user');
    }

    vscode.commands.executeCommand('setContext', 'inaCoding.isAuthenticated', isAuthenticated);
    this.listeners.forEach(listener => listener(this.getState()));
  }

  // ============ URI Handler ============

  private registerUriHandler() {
    this.context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
          Logger.info('Received URI callback:', uri.toString());

          if (uri.path === CALLBACK_PATH) {
            const params = new URLSearchParams(uri.query);
            const code = params.get('code');
            const state = params.get('state');
            const error = params.get('error');

            if (error) {
              Logger.error('OAuth error:', error);
              vscode.window.showErrorMessage(`Sign in error: ${error}`);
              return;
            }

            if (code && state) {
              await this.handleCallback(code, state);
            }
          }
        },
      })
    );
  }

  // ============ API Request Helper ============

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this._state.tokens && this._state.tokens.expiresAt - Date.now() < TOKEN_REFRESH_BUFFER) {
      await this.refreshTokens();
    }

    if (!this._state.tokens?.accessToken) { return {}; }

    return { 'Authorization': `Bearer ${this._state.tokens.accessToken}` };
  }

  // ============ Helpers ============

  private generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('base64url').substring(0, length);
  }

  dispose() {
    this.clearTokenRefresh();
    this.listeners.clear();
  }
}
