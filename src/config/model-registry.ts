/**
 * Model registry — the ONE place an upstream model id is allowed to appear.
 *
 * Public surfaces (UI labels, log lines, error messages, API responses,
 * telemetry fields) use the INA id and the INA display name. The upstream id is
 * an implementation detail of the inference layer and is never exported to any
 * of those surfaces. See BRANDING.md §1 and §5.
 *
 * WHY A REGISTRY AND NOT A RENAME
 *   Upstream ids are wire values: they are what the runtime is asked to load,
 *   what a cached completion is keyed by, and what a user's existing settings
 *   already contain. Renaming them in place would be a breaking change wearing
 *   a copy edit's clothes. Indirection keeps both properties: the public
 *   surface carries INA names, and every existing configuration keeps working.
 *
 * MIGRATION
 *   `scripts/brand-lint.mjs` holds the remaining direct upstream-id references
 *   at a measured baseline that may only shrink (`id_baseline` in
 *   .brandmap.json). As call sites move behind this registry, lower it. A new
 *   direct reference fails the build.
 */

/** Stable public identifier. This is what may appear anywhere a user can see. */
export type InaModelId =
  | 'ina-8-coding-pro'
  | 'ina-8-coding'
  | 'ina-8-coding-lite'
  | 'ina-8-coding-fast'
  | 'ina-8-pro'
  | 'ina-8'
  | 'ina-8-vision'
  | 'ina-embed';

export interface ModelDescriptor {
  /** Public id — safe for logs, errors, telemetry and API responses. */
  readonly id: InaModelId;
  /** Public display name — safe for UI. */
  readonly displayName: string;
  /** What the model is for, in product terms. */
  readonly capability: 'coding' | 'general' | 'vision' | 'embedding';
  /**
   * Upstream identifier passed to the inference runtime.
   * INTERNAL. Never log it, never return it from an API, never render it.
   */
  readonly upstreamId: string;
}

const REGISTRY: readonly ModelDescriptor[] = Object.freeze([
  { id: 'ina-8-coding-pro',  displayName: 'INA 8 Coding Pro',  capability: 'coding',    upstreamId: 'qwen2.5-coder:32b' },
  { id: 'ina-8-coding',      displayName: 'INA 8 Coding',      capability: 'coding',    upstreamId: 'qwen2.5-coder:14b' },
  { id: 'ina-8-coding-lite', displayName: 'INA 8 Coding Lite', capability: 'coding',    upstreamId: 'qwen2.5-coder:7b'  },
  { id: 'ina-8-coding-fast', displayName: 'INA 8 Coding Fast', capability: 'coding',    upstreamId: 'qwen2.5-coder:1.5b' },
  { id: 'ina-8-pro',         displayName: 'INA 8 Pro',         capability: 'general',   upstreamId: 'qwen3:14b' },
  { id: 'ina-8',             displayName: 'INA 8',             capability: 'general',   upstreamId: 'qwen3:8b' },
  { id: 'ina-8-vision',      displayName: 'INA 8 Vision',      capability: 'vision',    upstreamId: 'qwen2.5vl:7b' },
  { id: 'ina-embed',         displayName: 'INA Embedding Model', capability: 'embedding', upstreamId: 'nomic-embed-text' },
]);

const BY_ID = new Map<string, ModelDescriptor>(REGISTRY.map((m) => [m.id, m]));
const BY_UPSTREAM = new Map<string, ModelDescriptor>(REGISTRY.map((m) => [m.upstreamId, m]));

/** Every model, in declaration order. */
export function allModels(): readonly ModelDescriptor[] {
  return REGISTRY;
}

/** Look up by public id. */
export function getModel(id: string): ModelDescriptor | undefined {
  return BY_ID.get(id);
}

/**
 * Resolve any id — public or upstream — to its descriptor.
 * Accepting the upstream form is what keeps existing user settings working.
 */
export function resolveModel(idOrUpstream: string): ModelDescriptor | undefined {
  return BY_ID.get(idOrUpstream) ?? BY_UPSTREAM.get(idOrUpstream);
}

/**
 * The upstream id to send to the inference runtime.
 * Call this at the transport boundary and nowhere else.
 */
export function toUpstreamId(idOrUpstream: string): string | undefined {
  return resolveModel(idOrUpstream)?.upstreamId;
}

/**
 * The display name for any surface a human can read.
 *
 * An unknown id resolves to a neutral label rather than being echoed back:
 * echoing an unrecognised value is exactly how an upstream id reaches a log
 * line or an error toast that a customer then screenshots.
 */
export function toPublicName(idOrUpstream: string | null | undefined): string {
  if (!idOrUpstream) return 'INA 8';
  return resolveModel(idOrUpstream)?.displayName ?? 'INA 8';
}

/** The public id for telemetry and API responses, on the same fail-closed rule. */
export function toPublicId(idOrUpstream: string | null | undefined): InaModelId {
  if (!idOrUpstream) return 'ina-8';
  return resolveModel(idOrUpstream)?.id ?? 'ina-8';
}

/**
 * True when a string carries an upstream model name. Use it in assertions and
 * tests to keep upstream ids off public surfaces.
 */
export function containsUpstreamId(text: string): boolean {
  return REGISTRY.some((m) => text.includes(m.upstreamId));
}
