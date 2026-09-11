/**
 * Model registry — the single source of truth for every model this extension
 * knows about.
 *
 * WHAT CHANGED AND WHY
 *   This file used to carry an `upstreamId` per model, and described itself as
 *   "the ONE place an upstream model id is allowed to appear". That was true of
 *   the file and false of the repository: nothing imported this module. The
 *   live path ran through a second, contradictory map in ConfigManager, and
 *   nine other modules hardcoded raw ids and bypassed both. A registry with no
 *   importers is not a single source of truth; it is a comment with syntax.
 *
 *   The upstream mapping now lives SERVER-SIDE ONLY, in the private API
 *   repository (`src/lib/models/resolveInaModel.ts`). The extension sends an
 *   INA id and the server resolves it. This repository is public: a mapping
 *   that ships here is published, whatever the surrounding comment says.
 *
 * THE CONTRACT
 *   - `id` is the wire value. It is what goes on the network, into settings,
 *     into cache keys and into telemetry. It is safe to log and to render.
 *   - `displayName` is the only string a human should be shown.
 *   - There is no other identifier. If you find yourself wanting one, the
 *     thing you want belongs on the server.
 */

/** What a model is for, in product terms. */
export type ModelCapability = 'coding' | 'general' | 'vision' | 'embedding';

/** Relative cost/latency band. Routing decisions key on this, never on a size. */
export type ModelTier = 'fast' | 'standard' | 'pro';

/** Stable public identifier — safe anywhere, including a user's screen. */
export type InaModelId =
  | 'ina-8-coding-fast'
  | 'ina-8-coding-lite'
  | 'ina-8-coding'
  | 'ina-8-coding-pro'
  | 'ina-8'
  | 'ina-8-pro'
  | 'ina-8-vision'
  | 'ina-embed';

export interface InaModel {
  /** Canonical wire id, e.g. 'ina-8-coding-pro'. */
  readonly id: InaModelId;
  /** User-visible label, e.g. 'INA 8 Coding Pro'. */
  readonly displayName: string;
  readonly capability: ModelCapability;
  /**
   * Context window in tokens. Owned here rather than in TokenCounter, which
   * kept a second table keyed by upstream id and drifted from this one.
   */
  readonly contextWindow: number;
  /**
   * Whether the model accepts fill-in-the-middle prompts. Owned here rather
   * than in FIMTypes, which inferred it from an upstream model enum.
   */
  readonly supportsFim: boolean;
  readonly tier: ModelTier;
}

export const INA_MODELS: readonly InaModel[] = Object.freeze([
  { id: 'ina-8-coding-fast', displayName: 'INA 8 Coding Fast', capability: 'coding',    contextWindow: 32768, supportsFim: true,  tier: 'fast'     },
  { id: 'ina-8-coding-lite', displayName: 'INA 8 Coding Lite', capability: 'coding',    contextWindow: 32768, supportsFim: true,  tier: 'standard' },
  { id: 'ina-8-coding',      displayName: 'INA 8 Coding',      capability: 'coding',    contextWindow: 32768, supportsFim: true,  tier: 'standard' },
  { id: 'ina-8-coding-pro',  displayName: 'INA 8 Coding Pro',  capability: 'coding',    contextWindow: 32768, supportsFim: true,  tier: 'pro'      },
  { id: 'ina-8',             displayName: 'INA 8',             capability: 'general',   contextWindow: 32768, supportsFim: true,  tier: 'standard' },
  { id: 'ina-8-pro',         displayName: 'INA 8 Pro',         capability: 'general',   contextWindow: 32768, supportsFim: true,  tier: 'pro'      },
  { id: 'ina-8-vision',      displayName: 'INA 8 Vision',      capability: 'vision',    contextWindow: 32768, supportsFim: false, tier: 'standard' },
  { id: 'ina-embed',         displayName: 'INA Embedding',     capability: 'embedding', contextWindow: 8192,  supportsFim: false, tier: 'fast'     },
] as const);

/** Every known id, in declaration order. */
export const MODEL_IDS: readonly string[] = Object.freeze(INA_MODELS.map((m) => m.id));

const BY_ID = new Map<string, InaModel>(INA_MODELS.map((m) => [m.id, m]));

/**
 * The default for each capability.
 *
 * This is a MAPPED TYPE over `ModelCapability`, not a plain Record: adding a
 * capability to the union without giving it a default is a compile error, so
 * `defaultModel()` can never reach an undefined branch. That is the
 * exhaustiveness guard — a runtime `throw` in the default case would only tell
 * us at runtime, on a user's machine, what the compiler can tell us here.
 */
const DEFAULT_BY_CAPABILITY: { readonly [K in ModelCapability]: InaModelId } = {
  coding: 'ina-8-coding-pro',
  general: 'ina-8-pro',
  vision: 'ina-8-vision',
  embedding: 'ina-embed',
};

/** Look up by id. Returns undefined for anything not in the registry. */
export function getModel(id: string): InaModel | undefined {
  return BY_ID.get(id);
}

/** True when `id` is a registry id. Use this at trust boundaries. */
export function isInaModelId(id: string | null | undefined): id is InaModelId {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * The label to show a human. FAILS CLOSED.
 *
 * An unrecognised id renders as a neutral label and is never echoed back. Two
 * wrong answers were both available here and both were rejected:
 *
 *   echo the id      — a legacy settings value can still hold an upstream id,
 *                      and a status bar is one screenshot away from public.
 *   name a model     — returning 'INA 8' for anything unknown, as the previous
 *                      implementation did, turns "the router sent something
 *                      unexpected" into a screen that confidently states the
 *                      wrong model.
 *
 * 'INA Model' says only what is actually known.
 */
export const UNKNOWN_MODEL_LABEL = 'INA Model';

export function getDisplayName(id: string): string {
  return BY_ID.get(id)?.displayName ?? UNKNOWN_MODEL_LABEL;
}

/** Every model with the given capability, in declaration order. */
export function modelsByCapability(c: ModelCapability): readonly InaModel[] {
  return INA_MODELS.filter((m) => m.capability === c);
}

/** The default model for a capability. Total by construction — see above. */
export function defaultModel(c: ModelCapability): InaModel {
  return BY_ID.get(DEFAULT_BY_CAPABILITY[c])!;
}

/**
 * The context window for an id, with a conservative floor for unknown ids.
 *
 * 8192 is chosen because under-estimating truncates a prompt (recoverable)
 * while over-estimating gets it rejected by the server (not recoverable in the
 * same request).
 */
export const CONSERVATIVE_CONTEXT_WINDOW = 8192;

export function contextWindowFor(id: string): number {
  return BY_ID.get(id)?.contextWindow ?? CONSERVATIVE_CONTEXT_WINDOW;
}
