/**
 * OfflineManifest — where offline mode learns what it is allowed to run.
 *
 * THE PROBLEM THIS SOLVES
 *   Offline mode manages a local inference runtime directly. To do that it
 *   needs the runtime's command name and the ids of models small enough to run
 *   on a laptop. Those are upstream names, and this repository is public, so
 *   the previous implementation published eleven of them — including one that
 *   suggestModelDownload() rendered verbatim into a modal dialog, in the form
 *   `Download <upstream model id> (<size>) for offline AI?`.
 *
 *   Three options were considered. Deleting offline mode removes a real
 *   capability. Declaring a source exemption leaves the names published and
 *   merely stops the guard complaining. Fetching the manifest from the server
 *   keeps the capability and removes the names from the published source, which
 *   is what this does.
 *
 * THE SHAPE OF THE BARGAIN
 *   Offline mode now requires ONE online session before it can work. That is a
 *   real cost and it is stated plainly in the UI rather than hidden: a user who
 *   has never connected is told offline mode is not provisioned, instead of
 *   being shown a download prompt that would fail.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED
 *   This is not a security boundary. The manifest is served to any
 *   authenticated client and its contents are public knowledge. The claim is
 *   narrower and it is the one that matters here: THIS REPOSITORY no longer
 *   contains the names, so cloning it does not disclose them.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

export interface OfflineManifest {
  /** Executable that manages local models, e.g. for a version probe. */
  readonly runtimeCommand: string;
  /** Base URL the local runtime is expected to answer on. */
  readonly runtimeUrl: string;
  /** Model ids acceptable for offline use, best first. */
  readonly models: readonly string[];
  /** Template for the pull command; `{model}` is substituted. */
  readonly pullCommandTemplate: string;
  /** When this copy was fetched, for staleness reporting. */
  readonly fetchedAt: number;
}

const MANIFEST_FILE = 'offline-manifest.json';

/**
 * Validate an untrusted manifest.
 *
 * Written by hand rather than with a schema library because this module is on
 * the activation path and the extension has no runtime validator dependency;
 * adding one for seven fields would be the larger change. Every field is
 * checked, and a manifest that fails ANY check is rejected whole — a
 * half-applied manifest would leave offline mode pointing at one server's
 * runtime with another's model list.
 */
export function parseManifest(input: unknown): OfflineManifest | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  const str = (v: unknown, max = 200): string | null =>
    typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

  const runtimeCommand = str(o.runtimeCommand, 100);
  const runtimeUrl = str(o.runtimeUrl, 300);
  const pullCommandTemplate = str(o.pullCommandTemplate, 300);
  if (!runtimeCommand || !runtimeUrl || !pullCommandTemplate) return null;

  // The runtime URL must be loopback. A manifest is server-controlled input,
  // and "offline mode" that can be pointed at a remote host by the server is
  // not offline mode — it is an exfiltration path wearing its name.
  let parsed: URL;
  try {
    parsed = new URL(runtimeUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== '[::1]') {
    return null;
  }

  if (!pullCommandTemplate.includes('{model}')) return null;

  if (!Array.isArray(o.models) || o.models.length === 0 || o.models.length > 50) return null;
  const models: string[] = [];
  for (const m of o.models) {
    const v = str(m, 120);
    if (!v) return null;
    models.push(v);
  }

  const fetchedAt = typeof o.fetchedAt === 'number' && Number.isFinite(o.fetchedAt) ? o.fetchedAt : Date.now();

  return { runtimeCommand, runtimeUrl, models, pullCommandTemplate, fetchedAt };
}

export class OfflineManifestStore {
  private cached: OfflineManifest | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, MANIFEST_FILE);
  }

  /** The cached manifest, or null when this install has never been online. */
  async get(): Promise<OfflineManifest | null> {
    if (this.cached) return this.cached;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.uri);
      const parsed = parseManifest(JSON.parse(new TextDecoder().decode(bytes)));
      if (!parsed) {
        Logger.warn('[Offline] cached manifest failed validation and was ignored');
        return null;
      }
      this.cached = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Fetch and cache the manifest. Safe to call on every activation.
   *
   * A failure is never fatal and never clears a good cached copy: the whole
   * point of the cache is to survive the server being unreachable, which is
   * precisely the condition offline mode exists for.
   */
  async refresh(endpoint: string, headers: Record<string, string>): Promise<OfflineManifest | null> {
    try {
      const resp = await fetch(`${endpoint}/api/v1/client-manifest`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        Logger.debug(`[Offline] manifest fetch returned HTTP ${resp.status}`);
        return this.get();
      }
      const body = (await resp.json()) as { offline?: unknown };
      const parsed = parseManifest(body?.offline);
      if (!parsed) {
        Logger.warn('[Offline] server manifest failed validation; keeping the cached copy');
        return this.get();
      }
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      await vscode.workspace.fs.writeFile(
        this.uri,
        new TextEncoder().encode(JSON.stringify({ ...parsed, fetchedAt: Date.now() }, null, 2))
      );
      this.cached = parsed;
      Logger.info('[Offline] manifest refreshed');
      return parsed;
    } catch (e) {
      Logger.debug('[Offline] manifest fetch failed:', e);
      return this.get();
    }
  }
}

/** Shown wherever offline mode is unavailable for want of a manifest. */
export const OFFLINE_NOT_PROVISIONED =
  'Offline models not provisioned. Connect once to enable offline mode.';
