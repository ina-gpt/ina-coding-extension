# INA Coding — AI Code Assistant

<p align="center">
  <img src="media/icon-256.png" alt="INA Coding" width="128" height="128" />
</p>

<p align="center">
  <strong>Self-hosted AI coding assistant. Privacy-first. GDPR compliant. Made in Germany.</strong>
</p>

<p align="center">
  <a href="https://inagpt.com">Website</a> •
  <a href="https://inagpt.com/coding/docs">Documentation</a> •
  <a href="https://github.com/inagpt/ina-coding/issues">Report Bug</a> •
  <a href="https://github.com/inagpt/ina-coding/discussions">Discussions</a>
</p>

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
- Multi-model support (Qwen 2.5 Coder, DeepSeek, CodeLlama, StarCoder)
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
Your code stays on YOUR server. Zero telemetry by default.

- **Self-hosted**: runs on your own infrastructure
- **GDPR compliant**: data processed in Germany
- **Zero telemetry**: no data sent to third parties
- **Encryption at rest**: AES-256-GCM for stored data
- **Secret detection**: auto-strips API keys, passwords, tokens before sending
- **Sensitive file protection**: .env, .pem, .key files auto-excluded
- **Ephemeral processing**: server deletes code after processing
- **RBAC**: role-based access control with API key management
- **Audit logging**: tamper-resistant hash-chain audit trail

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

INA Coding has 300+ configurable settings. Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `inaCoding.api.endpoint` | `https://inagpt.com` | Server URL |
| `inaCoding.privacy.mode` | `standard` | Privacy mode (standard/strict/local_only) |
| `inaCoding.privacy.telemetryEnabled` | `false` | Send telemetry (OFF by default) |
| `inaCoding.completion.enabled` | `true` | Enable tab completion |
| `inaCoding.agent.requireApproval` | `true` | Require plan approval |
| `inaCoding.theme.mode` | `auto` | Theme (auto/light/dark) |

---

## Architecture

```
+---------------------------------------------------+
|                  VS Code Extension                 |
|  Chat | Inline Edit | Completion | Agent | Search  |
+---------------------------------------------------+
|           INA Coding API (Self-hosted)             |
|  Next.js | PostgreSQL | pgvector | Embeddings      |
+---------------------------------------------------+
|              GPU Server (Ollama)                   |
|     Qwen 2.5 Coder 32B | nomic-embed-text         |
+---------------------------------------------------+
```

---

## License

Copyright 2026 INA GPT GmbH, Berlin. All rights reserved.
See [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with care in Berlin, Germany<br/>
  <a href="https://inagpt.com">inagpt.com</a>
</p>
