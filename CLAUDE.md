@AGENTS.md

# Claude Code — interaqt framework repo

## Automatic knowledge loading

When starting a Claude Code session in this repo, follow these steps before coding:

### 1. Read the knowledge base

Read and internalize documentation under:

- `agent/agentspace/knowledge/usage/` — usage guides (start here)
- `agent/agentspace/knowledge/generator/` — code generation guides
- `agentspace/knowledge/` — framework technical deep-dives

Required starting points:

- `agent/agentspace/knowledge/usage/00-mindset-shift.md`
- `agent/agentspace/knowledge/usage/01-core-concepts.md`

### 2. Project context

From the knowledge base, confirm:

- **Project type**: interaqt framework (reactive backend)
- **Frontend** (example apps): Axii
- **Coding style**: TypeScript + reactive/declarative patterns
- **Standards**: follow guides in `agent/agentspace/knowledge/generator/`

### 3. Startup checklist

1. **Read knowledge docs** — understand stack, conventions, and best practices
2. **Review repo layout** — identify relevant modules under `src/`
3. **Check layer rules** — read matching files in `.cursor/rules/` when editing specific paths

### 4. Development principles

Apply learned conventions in every task:

- Follow code generation guides under `agent/agentspace/knowledge/generator/`
- Use interaqt + Axii reactive patterns in example apps
- Match existing code style and structure
- Apply documented best practices
- Write all prose (docs, comments, reports, replies) in plain professional language — see `AGENTS.md` § "Plain professional language"

### 5. Knowledge refresh

Re-read relevant docs when:

- Knowledge files were updated or added
- Task touches filtered entities, cascade, storage internals, or migrations
- Observed behavior contradicts documentation
- User asks to refresh project context

## Quick commands

These are informal session commands (not shell aliases):

- `refresh-knowledge` — re-read `agent/agentspace/knowledge/` and `agentspace/knowledge/`
- `check-guide` — verify current work against generator guides
- `project-context` — summarize stack, conventions, and active module

## Notes

1. **Knowledge priority**: guides under `agent/agentspace/knowledge/` take precedence for app generation; `agentspace/knowledge/` for framework internals
2. **Stay in sync**: re-read docs when paths or behavior look stale
3. **Apply immediately**: use learned conventions in the same session
4. **Reconfirm at start**: validate knowledge at the beginning of each session

## Example-app generation

When generating backend apps from examples (not when editing the framework itself), switch to `agent/CLAUDE.md`. That workflow lives under `agent/` and tracks progress via `docs/{module}.status.json`.

---

**Startup reminder**: complete the knowledge loading steps above before starting implementation work.
