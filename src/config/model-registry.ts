/**
 * Model registry — the single source of truth for every model this extension
 * knows about.
 *
 * THE 7.4 GENERATION
 *   The ladder was renamed from ina-8-* to ina-7-4-* because the "INA 8"
 *   designation is reserved for the model being fine-tuned on INA's own
 *   infrastructure and is not in use here. A ladder serving third-party models
 *   must not carry that name: the provenance record and the future real INA 8
 *   would become indistinguishable, which is a conformity problem rather than a
 *   naming preference.
 *
 * THE CONTRACT
 *   - `id` is the wire value. It goes on the network, into settings, into cache
 *     keys and telemetry. It is safe to log and to render.
 *   - `displayName` is the only string a human should be shown.
 *   - There is no other identifier. The upstream mapping lives server-side, in
 *     the private API repository. This repository is public; anything here is
 *     published, whatever the surrounding comment says.
 *
 * EVERY NUMBER BELOW WAS MEASURED, NOT CHOSEN
 *   See the API repository's resolveInaModel.ts for the serving models. The
 *   two values that used to be wrong are called out on their fields.
 */

/** What a model is for, in product terms. */
export type ModelCapability = 'coding' | 'general' | 'vision' | 'embedding';

/** Relative cost/latency band. Routing decisions key on this, never on a size. */
export type ModelTier = 'fast' | 'standard' | 'pro';

/** Stable public identifier — safe anywhere, including a user's screen. */
export type InaModelId =
  | 'ina-7-4-coding-fast'
  | 'ina-7-4-coding-lite'
  | 'ina-7-4-coding'
  | 'ina-7-4-coding-pro'
  | 'ina-7-4'
  | 'ina-7-4-pro'
  | 'ina-7-4-vision'
  | 'ina-7-4-embed';

export interface InaModel {
  /** Canonical wire id, e.g. 'ina-7-4-coding-pro'. */
  readonly id: InaModelId;
  /** User-visible label, e.g. 'INA 7.4 Coding Pro'. */
  readonly displayName: string;
  readonly capability: ModelCapability;
  /**
   * Tokens the ENGINE serves — not the serving model's maximum.
   *
   * Measured 2026-09-11: a ~17k-token prompt to a model whose maximum is
   * 262144 returned prompt_eval_count 12287, because the engine runs a 12288
   * window. The previous value here was 32768, so TokenCounter budgeted 2.7x
   * the real window and the front of every long prompt was silently discarded
   * by the engine. Budgeting is the only consumer of this number, and
   * under-estimating truncates locally (visible, recoverable) while
   * over-estimating truncates remotely (invisible).
   */
  readonly contextWindow: number;
  /**
   * Whether the SERVING model accepts fill-in-the-middle prompts.
   *
   * Measured false everywhere: no model on this engine declares the `insert`
   * capability or carries FIM sentinels in its template. The previous registry
   * advertised true for seven of eight ids, and a non-FIM model given sentinel
   * markers does not error — it ignores them and writes prose, which was then
   * inserted into the editor as if it were code.
   */
  readonly supportsFim: boolean;
  readonly tier: ModelTier;
  /**
   * False when this id is served by a substitute rather than a model chosen
   * for it.
   *
   * This is the seam the UI and the tests use to tell the difference without
   * naming anything upstream. Five of the eight ids are currently substitutions
   * — they resolve and they work, and they are not what their name implies.
   */
  readonly backedByDedicatedModel: boolean;
}

export const INA_MODELS: readonly InaModel[] = Object.freeze([
  { id: 'ina-7-4-coding-fast', displayName: 'INA 7.4 Coding Fast', capability: 'coding',    contextWindow: 12288, supportsFim: false, tier: 'fast',     backedByDedicatedModel: false },
  { id: 'ina-7-4-coding-lite', displayName: 'INA 7.4 Coding Lite', capability: 'coding',    contextWindow: 12288, supportsFim: false, tier: 'standard', backedByDedicatedModel: false },
  { id: 'ina-7-4-coding',      displayName: 'INA 7.4 Coding',      capability: 'coding',    contextWindow: 12288, supportsFim: false, tier: 'standard', backedByDedicatedModel: false },
  { id: 'ina-7-4-coding-pro',  displayName: 'INA 7.4 Coding Pro',  capability: 'coding',    contextWindow: 12288, supportsFim: false, tier: 'pro',      backedByDedicatedModel: true  },
  { id: 'ina-7-4',             displayName: 'INA 7.4',             capability: 'general',   contextWindow: 12288, supportsFim: false, tier: 'standard', backedByDedicatedModel: true  },
  { id: 'ina-7-4-pro',         displayName: 'INA 7.4 Pro',         capability: 'general',   contextWindow: 12288, supportsFim: false, tier: 'pro',      backedByDedicatedModel: true  },
  { id: 'ina-7-4-vision',      displayName: 'INA 7.4 Vision',      capability: 'vision',    contextWindow: 12288, supportsFim: false, tier: 'standard', backedByDedicatedModel: false },
  { id: 'ina-7-4-embed',       displayName: 'INA 7.4 Embed',       capability: 'embedding', contextWindow: 12288, supportsFim: false, tier: 'fast',     backedByDedicatedModel: false },
] as const);

/** Every known id, in declaration order. */
export const MODEL_IDS: readonly string[] = Object.freeze(INA_MODELS.map((m) => m.id));

const BY_ID = new Map<string, InaModel>(INA_MODELS.map((m) => [m.id, m]));

/**
 * The default for each capability.
 *
 * A MAPPED TYPE over `ModelCapability`, not a plain Record: adding a capability
 * without giving it a default is a compile error, so `defaultModel()` can never
 * reach an undefined branch. A runtime throw would only tell us on a user's
 * machine what the compiler can tell us here.
 */
const DEFAULT_BY_CAPABILITY: { readonly [K in ModelCapability]: InaModelId } = {
  coding: 'ina-7-4-coding-pro',
  general: 'ina-7-4',
  vision: 'ina-7-4-vision',
  embedding: 'ina-7-4-embed',
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
 * wrong answers were both available and both rejected: echoing the id lets a
 * legacy settings value put an upstream name on screen, and naming a specific
 * model turns "the router sent something unexpected" into a screen that
 * confidently states the wrong one. 'INA Model' says only what is known.
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
 * 8192 under-estimates rather than over-estimates: a prompt built too small is
 * truncated locally where the caller can see it, while one built too large is
 * truncated by the engine where nobody can.
 */
export const CONSERVATIVE_CONTEXT_WINDOW = 8192;

export function contextWindowFor(id: string): number {
  return BY_ID.get(id)?.contextWindow ?? CONSERVATIVE_CONTEXT_WINDOW;
}

/**
 * Whether fill-in-the-middle may be used for this id.
 *
 * Unknown ids answer false. Guessing true and being wrong does not fail — it
 * returns prose that looks like a completion.
 */
export function supportsFim(id: string): boolean {
  return BY_ID.get(id)?.supportsFim ?? false;
}
