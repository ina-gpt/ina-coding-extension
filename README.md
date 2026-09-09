# INA Coding

**Self-hosted AI coding assistant for regulated European organisations.**

Operated by INA GPT GmbH, Berlin — certified to ISO/IEC 27001:2022 by TÜV SÜD
(Reg. No. 12 310 71178 TMS, valid until 2029-08-09).
Gaia-X European Member No. 0469. ISO/IEC 42001 certification in progress.

Your source code stays on your infrastructure. A German GmbH is contractually
accountable for it: Auftragsverarbeitungsvertrag under Art. 28 GDPR,
named Geschäftsführer, German court of jurisdiction.

<https://www.tuvsud.com/ms-zert>

<p align="center">
  <img src="media/icon-256.png" alt="INA Coding" width="128" height="128" />
</p>

<p align="center">
  <a href="https://inagpt.com">Website</a> •
  <a href="https://inagpt.com/coding/docs">Documentation</a> •
  <a href="IMPRESSUM.md">Impressum</a> •
  <a href="BRANDING.md">Naming &amp; claims standard</a>
</p>

---

## Compliance

### Issued

| Standard | Scope | Reference | Validity |
|---|---|---|---|
| **ISO/IEC 27001:2022** | Operation and provision of an AI-powered platform | Reg. No. 12 310 71178 TMS, TÜV SÜD | 2026-08-10 → 2029-08-09 |

Certificate verification (Fundstelle): <https://www.tuvsud.com/ms-zert>

### In progress

| Standard | Status |
|---|---|
| **ISO/IEC 42001:2023** (AI management system) | Certification with TÜV SÜD **in progress** — not yet issued |

### Memberships

Gaia-X European Association for Data and Cloud AISBL — European Member
(Start-up), Member No. 0469 · KI Bundesverband e. V. · Startup-Verband
(No. 14346) · IHK Berlin (No. 10702437784)

---

## Company

**INA GPT GmbH** · Selerweg 40 A, 12169 Berlin, Deutschland
Geschäftsführer: Hassan Taheri
Amtsgericht Berlin (Charlottenburg), HRB 288452 B · USt-IdNr. DE464255291
<info@inagpt.com> · +49 30 4243 2400 · <https://inagpt.com>

Full legal notice: **[IMPRESSUM.md](IMPRESSUM.md)**

---

## Features

### AI Chat
Ask questions about your code, get explanations, refactor suggestions, and more — all with full context from your active file, selection, and project.

- Full codebase awareness via `@file:`, `@symbol:`, `@docs:`, `@git:` mentions
- Streaming responses with syntax-highlighted code blocks
- Copy, insert at cursor, or apply code directly to files
- Image support — paste screenshots for visual context
- Design-to-code conversion from UI mockups

### Inline Edit (Cmd+K)
Select code and press `Cmd+K` to describe changes. See a diff preview, then accept or reject.

- Smart selection expansion (function, block, statement)
- Diff preview with per-hunk accept/reject
- Multi-cursor editing support
- 8 quick actions: Refactor, Fix, Comment, Test, Optimize, Error handling, Types, Explain

### Tab Completion
AI-powered autocomplete as you type. Press `Tab` to accept, `Cmd+→` for word-by-word, `Alt+]` to cycle alternatives.

- Fill-in-Middle (FIM) with context-aware completions
- Model-agnostic inference layer — any standard chat-completions API or GGUF endpoint
- Ghost text preview with partial accept
- Learns from your coding patterns

### Agent Mode (Multi-File Edit)
Toggle Agent mode for complex tasks. Describe what you want, review the plan, watch execution, and selectively accept changes.

- AI-generated execution plans with step-by-step breakdown
- Sequential execution with pause/resume/rollback
- File create, edit, delete, rename, move operations
- Terminal command execution with auto-fix on errors
- Change review with per-file and per-hunk accept/reject
- Full rollback capability at any point

### Codebase Search (RAG)
Semantic search across your entire codebase using embeddings and vector similarity.

- AST-based code chunking (10 languages)
- Hybrid search: vector similarity + keyword matching
- Context-aware results with citations
- File watcher for real-time index updates

### Documentation RAG
Index external documentation and search with AI.

- Crawl documentation websites automatically
- 15+ built-in documentation sources (React, Next.js, TypeScript, Python, etc.)
- `@docs:react/useState` — reference docs inline in chat

### Memory System
INA Coding remembers facts, decisions, and patterns across sessions.

- Auto-extracts memorable information from conversations
- "Remember that..." / "Forget about..." natural language commands
- Project-specific and global memories
- Corrections learning — won't repeat mistakes

### Project Rules
Create a `.ina-rules` file to define coding standards, and the AI follows them in every response.

- 15 rule categories: Style, Architecture, Do's, Don'ts, Naming, Testing, etc.
- 7 pre-built templates: Next.js, React, Python, Go, Rust, Express, Minimal
- Auto-detect from project configuration
- Global rules for personal preferences across all projects

### Privacy & Security

Every item in this list has an implementation **and an executable test**. The
test is named next to the claim; if a test is removed, the claim moves to
Roadmap in the same commit (see [BRANDING.md](BRANDING.md) §4).

- **Self-hosted** — the assistant talks only to the server URL you configure
  (`inaCoding.api.endpoint`). No INA-operated endpoint is contacted by default.
- **Encryption at rest — AES-256-GCM** for locally stored data, with a random
  IV per message and authenticated decryption.
  → `tests/claims.test.cjs` · `src/services/privacy/DataEncryptionService.ts`
- **Secret detection** — API keys, passwords and tokens are detected and masked
  before content leaves the editor; detection records never carry the raw value.
  → `tests/claims.test.cjs` · `src/services/privacy/SecretDetector.ts`
- **Sensitive file protection** — `.env`, `.pem`, `.key` and similar files are
  excluded from AI context.
  → `tests/claims.test.cjs` · `src/services/codesec/SensitiveFileDetector.ts`
- **Ephemeral processing signal** — every request carries an explicit
  no-retention header for the server to honour.
  → `tests/claims.test.cjs` · `src/services/codesec/EphemeralPolicyEnforcer.ts`
- **RBAC** — role-based access control with API key management and team roles.
  → `tests/claims.test.cjs` · `src/services/access/AccessTypes.ts`

**Data protection.** Code is processed on the infrastructure you operate.
INA GPT GmbH offers an Auftragsverarbeitungsvertrag under Art. 28 GDPR, with a
named Geschäftsführer and a German court of jurisdiction. Where INA GPT GmbH
operates the service, processing takes place in Germany.

**Telemetry — read this before deploying in a regulated environment.**
Anonymised usage statistics are **enabled by default**
(`inaCoding.telemetry.enabled`, `.abTesting`, `.modelRouting`), retained for up
to 180 days (`inaCoding.telemetry.retentionDays`). Per the setting
descriptions, code content, file names and prompts are not collected, and data
remains on your server. Set `inaCoding.telemetry.enabled` to `false` to disable
collection entirely. Defaults are pinned by a test so they cannot change
silently.

---

## Roadmap

Listed here rather than under Features because the claim is not yet proven by
an implementation and a test in this repository. This section exists so the
Features list stays honest.

- **Telemetry off by default.** The current shipped defaults enable anonymised
  telemetry. Making "off" the default is a product decision that has not been
  taken; until it is, the Features list does not claim it.
- **Tamper-resistant hash-chain audit trail.** The extension renders a chain
  integrity result returned by the server (`AuditLogViewer`), but the chain
  itself is implemented and verified server-side. No client-side implementation
  or test exists in this repository, so the property is not claimed here.

---

## Getting Started

### Prerequisites
- VS Code 1.85 or later
- INA Coding server (self-hosted on your infrastructure)

### Installation
1. Install from VS Code Marketplace
2. Open the INA Coding sidebar (click the INA icon in the activity bar)
3. Enter your server URL and API key
4. Start chatting!

### Quick Start
| Action | Shortcut |
|--------|----------|
| Open Chat | `Cmd+L` |
| Inline Edit | `Cmd+K` |
| Quick Question | `Cmd+I` |
| Agent Mode | `Cmd+Shift+K` |
| Accept Completion | `Tab` |
| Show Shortcuts | `Cmd+/` |

---

## Themes
10 built-in themes including INA Dark, INA Light, Monokai, Dracula, Nord, Solarized, GitHub. Syncs with your VS Code theme automatically. Custom accent colors.

## Offline Mode
Works offline with a local model. Queues requests when disconnected and syncs when back online.

## Status Indicators
Real-time status bar showing connection, model status, indexing progress, active requests, token usage, and system health.

---

## Configuration

INA Coding ships 300+ settings. The ones most deployments touch:

| Setting | Default | Description |
|---------|---------|-------------|
| `inaCoding.api.endpoint` | `https://inagpt.com` | Server URL |
| `inaCoding.privacy.mode` | `standard` | Privacy mode (standard/strict/local_only) |
| `inaCoding.privacy.encryptAtRest` | `true` | Encrypt locally stored data |
| `inaCoding.privacy.secretDetection` | `true` | Detect and mask secrets before sending |
| `inaCoding.telemetry.enabled` | `true` | Anonymised usage statistics |
| `inaCoding.completion.enabled` | `true` | Enable tab completion |
| `inaCoding.agent.requireApproval` | `true` | Require plan approval |
| `inaCoding.ui.theme` | `auto` | Theme (auto/light/dark) |

The complete settings reference, deployment topology and sizing guidance are
provided under NDA on request: <info@inagpt.com>.

---

## Architecture

```
+---------------------------------------------------+
|                 VS Code Extension                  |
|  Chat | Inline Edit | Completion | Agent | Search   |
+---------------------------------------------------+
|            INA Coding API (self-hosted)            |
+---------------------------------------------------+
|              INA Inference Runtime                 |
|            EU-based GPU infrastructure             |
+---------------------------------------------------+
```

Model provenance, runtime topology and capacity guidance are documented for
procurement and provided under NDA on request.

---

## License

Copyright 2026 INA GPT GmbH, Berlin. All rights reserved.
See [LICENSE](LICENSE) for details.

Third-party components retain their own licences and attribution; see
[LICENSE](LICENSE). Those notices are never rewritten by our naming standard —
see [BRANDING.md](BRANDING.md) §3.

---

<p align="center">
  Made with care in Berlin, Germany<br/>
  <a href="https://inagpt.com">inagpt.com</a>
</p>
