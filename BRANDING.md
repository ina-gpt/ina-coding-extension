# Public Naming and Claims Standard

Binding on every public surface of INA GPT GmbH: repository content, README,
CHANGELOG, release notes, repository description and topics, marketplace
listings, and published package metadata.

Enforced by `scripts/brand-lint.mjs` (CI + pre-commit hook). The rule used to
exist only as human judgement, which is exactly why it was violated — this file
is the human half and the linter is the machine half. Neither is optional.

## 1. Canonical public names

| Concern | Public name | Public API id |
|---|---|---|
| Text / coding model | **INA 8** | `ina-8` |
| Embedding model | **INA Embedding Model** | `ina-embed` |
| Inference runtime | **INA Inference Runtime** | `ina-inference-runtime` |
| Speech-to-text | **INA Speech-to-Text** | `ina-stt` |
| Text-to-speech | **INA Text-to-Speech** | `ina-tts` |
| Compute | **EU-based GPU infrastructure** | — |
| Platform | **INA GPT** | — |
| Legal entity | **INA GPT GmbH** | — |

## 2. Never on a public surface

Upstream model, runtime, speech-engine, infrastructure and internal-tooling
names, including but not limited to:

Qwen (all versions), Alibaba, Tongyi, Ollama, vLLM, llama.cpp, DeepSeek,
CodeLlama, StarCoder, Mistral, Llama 3/4, Gemma, Phi-3, nomic-embed-text,
Whisper, Piper, Wan 2.2, LTX-Video, FLUX.1, Hetzner, Vast.ai, KISSKI,
HammerHAI, GWDG, Claude Code, Anthropic, OpenAI.

The authoritative machine-readable list is `.brandmap.json`. This document and
that file are kept in step; the linter reads the JSON, never this table.

## 3. The attribution exemption — deliberate, not an oversight

`LICENSE`, `LICENSES/`, `NOTICE` and `THIRD_PARTY_NOTICES.md` are **exempt and
must never be rewritten by this standard.**

Apache-2.0 §4(c)/(d) makes retention of copyright, patent, trademark and
attribution notices a condition of the licence. Stripping an upstream name from
those files to satisfy a branding preference would convert a marketing question
into a licence breach. Upstream attribution therefore lives in those files, and
only in those files. That separation — legal compliance in the licence files,
product naming everywhere else — is the whole design, and it is what makes the
rest of this standard defensible rather than deceptive.

## 3b. Legal-disclosure surfaces are exempt for the same reason

A page whose PURPOSE is legal disclosure must name real entities:

- a **subprocessor list** must name the actual subprocessors, including the
  hosting provider;
- a **DPA / AVV**, an **Impressum** and a **privacy policy** must name the real
  controller, processors and jurisdictions;
- **developer API documentation** must name the client SDK a caller is expected
  to use — an OpenAI-compatible endpoint cannot be documented without the words
  "OpenAI-compatible";
- a **negative comparative** ("we do not use X") names a vendor precisely in
  order to disclaim it, which is the opposite of the claim this standard forbids.

### The legal basis, stated precisely

An earlier version of this section cited **Art. 28(4) GDPR** as the source of
the disclosure duty. That was imprecise, and the citation is corrected here.
The decision does not change; only its basis is stated accurately.

| Provision | What it actually governs |
|---|---|
| **Art. 13(1)(e)** | Information to the data subject: the **recipients or categories of recipients** of personal data. This — with Art. 14(1)(e) for indirectly collected data — is the duty that makes a subprocessor disclosure necessary. |
| **Art. 5(1)(a)** | The general principle of lawfulness, fairness and **transparency**, which the disclosure serves. |
| **Art. 28(2)** | The controller's **prior authorisation** of subprocessors, and the processor's duty to **inform** of intended additions or replacements. |
| **Art. 28(4)** | The **flow-down by contract** of the same data-protection obligations to the subprocessor. It binds the processor–subprocessor contract; it is not the source of the public disclosure duty. |
| **Art. 30(1)(d)** | Records of processing: categories of recipients, including recipients in third countries. |

**Therefore:** naming the actual subprocessor on `/subprocessors` and `/dpa` is
correct and stays. Suppressing a real subprocessor's name to satisfy a branding
preference would be a transparency failure under Art. 13(1)(e) and Art. 5(1)(a).

The standing principle is unchanged and restated: **a legal disclosure
obligation outranks a naming preference.** It is the same reason `LICENSE` and
`THIRD_PARTY_NOTICES` are exempt in §3 — attribution there is an Apache-2.0
condition, and neither exemption is a loophole in the standard; both are the
standard recognising a duty it cannot override.

Measured on 2026-09-09: all 19 denylist hits on the live site were of exactly
these kinds — 11 on `/docs/api`, 4 on `/subprocessors`, 2 on `/dpa`, 2 on
`/technology`. Zero were brand violations.

The exemption is URL-scoped and term-scoped in `.brandmap.json`
(`surface_exemptions`), never global. `scripts/surface-lint.mjs --selftest`
proves it is narrow: the same term on an ordinary marketing page still fails.

## 4. Claims discipline (§5 UWG)

German unfair-competition law permits an absolute-supremacy claim only where it
is objectively provable. An unprovable superlative invites an Abmahnung.

Every public claim must be one of:

- **(a) a verifiable fact with a document reference** — e.g. a certificate
  registration number and validity window; or
- **(b) a factual capability statement** — what the software does, in the
  indicative.

Forbidden: "best in the world", "the most secure", "number one", "unbeatable",
"market leader", "industry-leading", and their German equivalents. The linter
carries the shapes; it runs on prose files only, because §5 UWG governs
advertising and a superlative inside a code comment is not a market claim.

**Security and privacy claims additionally require an implementation and an
executable test.** A claim that is implemented but untested must have its test
written before the claim ships. A claim with no implementation belongs under
"Roadmap", never under "Features". See the claim audit in the repository's
compliance evidence.

**Certification claims** state only what is issued, with registration number and
validity window. A certification in progress is described as "in progress" and
never as achieved. Where a TÜV SÜD Prüfzeichen or certificate is referenced in
an advertising context, the Fundstelle <https://www.tuvsud.com/ms-zert> must be
present (UWG Fundstellenpflicht).

**The Gaia-X member logo**, where used, keeps its clear space and is never
recoloured or distorted, per the Gaia-X Logo Usage Guide.

## 5. Identifiers are not copy

A protocol path, an environment variable, a configuration key or a persisted
model id is a compatibility surface. It is **never** blind-renamed to satisfy
this standard. The migration pattern is indirection:

- a new canonical name is added;
- the legacy name keeps working as a deprecated alias;
- a single deprecation warning is emitted per process;
- upstream ids live behind `src/config/model-registry.ts` and are never exported
  to a log line, an error message, an API response or a telemetry field.

The linter classifies these hits as `ID` so they are reported separately and
never silently rewritten.
