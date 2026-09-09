# Changelog

All notable changes to the INA Coding extension will be documented in this file.

## [1.0.0] — 2026-04-08

### Initial Release

#### Core Features
- **AI Chat** — Full-featured chat panel with streaming responses, code blocks, and context awareness
- **Inline Edit (Cmd+K)** — Select code and edit with AI, diff preview, multi-cursor support
- **Tab Completion** — AI-powered autocomplete with ghost text, word-by-word accept, alternative cycling
- **Agent Mode** — Multi-file editing with plan generation, sequential execution, and change review

#### Context & Intelligence
- **Codebase Indexing (RAG)** — AST-based chunking, embedding generation, semantic search
- **@ Mentions** — Reference files, symbols, docs, git, errors inline in chat
- **Active File Context** — Automatic context from current editor, selection, diagnostics
- **Documentation RAG** — Crawl and index documentation, 15+ built-in sources
- **Git Integration** — Branch, commits, diff, blame, PR context
- **LSP Integration** — Types, signatures, definitions, references, call hierarchy
- **Image Support** — Paste screenshots, design-to-code with INA Vision
- **Memory System** — Remember facts, decisions, patterns across sessions
- **Project Rules** — `.ina-rules` file for per-project AI behavior
- **Global Rules** — Personal preferences across all projects

#### Performance & Reliability
- **Multi-tier Caching** — Response, embedding, file, symbol caches with LRU eviction
- **Request Optimization** — Priority queue, batching, deduplication, throttling
- **Offline Mode** — Queue requests, local model fallback, graceful degradation
- **Error Recovery** — Auto-retry with backoff, circuit breakers, fallback chains, self-healing

#### UI/UX
- **10 Theme Presets** — Dark, Light, Monokai, Dracula, Nord, Solarized, GitHub + custom accent colors
- **Interactive Onboarding** — Welcome screen, feature tours, interactive tutorial
- **Keyboard Shortcuts** — 35+ shortcuts, chord sequences, 5 profiles (Cursor/Copilot/Vim compatible)
- **Status Indicators** — Connection, model, indexing, requests, tokens, health dashboard

#### Security & Privacy
- **Zero Telemetry** — No data sent to third parties (OFF by default)
- **GDPR Compliant** — Data processed in Germany, right to erasure, data portability
- **Encryption at Rest** — AES-256-GCM for stored data
- **Secret Detection** — 25+ patterns, auto-strip before transmission
- **Sensitive File Protection** — 45+ file patterns auto-excluded
- **RBAC** — Role-based access control with API key management
- **Audit Logging** — Tamper-resistant hash-chain audit trail
- **Ephemeral Processing** — Server deletes code after response

---

*Made by INA GPT GmbH, Berlin, Germany*
