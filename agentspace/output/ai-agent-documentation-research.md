# Writing Documentation That AI Coding Agents Can Learn From

## Research Report — March 2026

Comprehensive research on documentation formats, patterns, and anti-patterns for AI coding agents (Cursor, Claude Code, GitHub Copilot, Codex, etc.).

---

## 1. Documentation Formats That Work Best for LLMs

### Token Efficiency Is the Primary Constraint

AI agents consume documentation within strict token budgets. Format choice directly determines how much documentation fits in context:

| Format | Token Overhead | Use Case |
|--------|---------------|----------|
| Raw HTML | Baseline (100%) | Human browsers only |
| Markdown | ~10-20% of HTML (80-90% reduction) | Agent-friendly default |
| LAPIS (API spec) | ~14.5% of OpenAPI YAML (85.5% reduction) | API reference |
| llms.txt | Minimal (curated index) | Discovery/entry point |
| llms-full.txt | Full content, no fetching | Complete API reference |

**Key insight**: Markdown-based formats reduce token consumption by 80-90% compared to HTML by eliminating CSS, navigation, JavaScript, and decorative elements (source: Fern, March 2026).

### The Emerging Standard Stack

Three complementary formats are converging:

1. **AGENTS.md** — Operational instructions for AI coding agents. Under 150 lines. Adopted by 60,000+ open source repos. Stewarded by the Agentic AI Foundation (Linux Foundation). Supported by Codex, Cursor, Copilot, Windsurf, Amp, and others.

2. **llms.txt / llms-full.txt** — A plain-text Markdown index at `/llms.txt` providing a curated entry point for AI discovery. Created by Jeremy Howard (Answer.AI). Think "robots.txt for AI" — tells agents *what to read* rather than *what to crawl*.

3. **Cursor Rules (.cursor/rules/*.mdc)** — Pattern-specific instruction files with YAML frontmatter and glob-based file targeting. Supports priority ordering (1-100 scale) and hierarchical scoping.

### LAPIS: The API Documentation Format

A new domain-specific format (arxiv paper 2602.18541) designed specifically for LLM consumption. Achieves 85.5% token reduction vs OpenAPI YAML through:
- Centralized error definitions (define once, reference everywhere)
- Structured rate limit declarations
- Operation flow declarations
- Fully convertible from OpenAPI 3.x
- No special parser needed for LLM use

---

## 2. Structuring Context Documents and Rules Files

### The AGENTS.md Structure (What Actually Works)

Based on empirical testing across 2,500+ repositories (GitHub Blog analysis) and Blake Crosley's controlled experiments:

**Effective structure — organize by task, not by category:**

```markdown
## Build and Test Commands
- Install: `pip install -r requirements.txt`
- Test: `pytest -v --tb=short`
- Full verify: `ruff check . && pytest -v`

## Definition of Done
A task is complete when ALL of the following pass:
1. `ruff check .` exits 0
2. `pytest -v` exits 0 with no failures
3. Changed files have been staged and committed

## When Writing Code
- Run `ruff check .` after every file change
- Add type hints to all new functions
- Test command: `pytest tests/ -v -k "test_<module>"`

## When Reviewing Code
- Check for security issues: `bandit -r app/`
- Verify test coverage: `pytest --cov=app --cov-fail-under=80`

## When Blocked
- If tests fail after 3 attempts: stop and report the failing test
- If a dependency is missing: check `requirements.txt` first, then ask
- Never: delete files to resolve errors, force push, or skip tests
```

**Priority order for writing from scratch:**
1. Build and test commands (agent needs these before anything)
2. Definition of done (prevents "I think I'm done" false completions)
3. Escalation rules (prevents destructive workarounds)
4. Task-organized sections (reduces irrelevant instruction parsing)
5. Style preferences (add last, after everything else works)

### Cursor Rules Structure

```
.cursor/
  └── rules/
       ├── 001-core.mdc          # Core/workspace rules (001-099)
       ├── 100-integrations.mdc  # Integration rules (100-199)
       └── 200-patterns.mdc      # Pattern rules (200-299)
```

Key properties of effective rules:
- **Narrowly scoped** using `apply_when` with file globs and keywords
- **Imperative and minimal** — short, direct commands, not paragraphs
- **Supported by micro-examples** (2-5 lines showing the pattern)
- **Under 500 lines** per file, focused on frequently-used patterns
- Higher numbers take precedence in conflicts

### Hierarchical Scoping for Monorepos

AGENTS.md supports hierarchical discovery. Files closer to the working directory take precedence:

```
/repo/AGENTS.md                        ← Project-wide rules
  └─ /repo/services/AGENTS.md          ← Service defaults
      ├─ /repo/services/api/AGENTS.md  ← API-specific rules
      └─ /repo/services/web/AGENTS.md  ← Frontend-specific rules
```

OpenAI's Codex repository uses **88 separate AGENTS.md files** — one per service and package.

---

## 3. Lessons from Leading Projects

### Vercel v0

v0 uses a **dynamic system prompt** architecture:
- Detects AI-related intent using embeddings and keyword matching
- Injects targeted knowledge into the prompt at runtime (e.g., latest AI SDK version)
- Maximizes prompt-cache hits while keeping token usage low
- Uses **LLM Suspense** — a streaming manipulation layer for real-time fix-ups (wrong imports, URL substitution)
- Runs **autofixers** (deterministic + model-driven) during/after generation, achieving double-digit success rate increases

v0's three-input framework for prompts:
1. **Product surface**: List specific components, features, data
2. **Context of use**: Who uses it, when, what decisions they make
3. **Constraints & taste**: Responsiveness, colors, layout, style

### Anthropic's Agent-Friendly Pattern

Every page on Claude Code docs has a blockquote at the top:

```
> Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.
```

Agents see this, follow it, and use the structured index to navigate. This is lightweight, low-effort, and **works today in real agent workflows**.

### GitHub's Analysis of 2,500+ AGENTS.md Files

> "Most agent files fail because they're too vague — not because of technical limitations."

The primary failure mode is writing human documentation instead of agent operations.

---

## 4. Examples vs. Reference Docs vs. Conceptual Guides

### The Hierarchy of Documentation Value for AI Agents

Based on observed agent behavior patterns (Dachary Carey, Agent Skill Report, Feb 2026):

**Highest value:**
1. **Concrete code examples** — Agents pattern-match against examples more reliably than they interpret prose. 2-5 focused examples per concept is optimal (diminishing returns beyond 5).
2. **Executable commands** — Exact invocations with arguments. "What command proves this was done correctly?"
3. **Structured API reference** — Complete type schemas, parameter definitions, error response documentation.

**Medium value:**
4. **Constraint declarations** — MUST/MUST NOT rules with specific, testable criteria.
5. **DO/DON'T paired examples** — Contrastive patterns showing both correct and incorrect approaches.

**Lowest value (often counterproductive):**
6. **Conceptual guides** — Long-form explanations of "why." Useful for humans, but agents skip or truncate them. If included, keep them extremely brief.
7. **Wayfinding / navigation** — Table of contents, breadcrumbs, search. Agents bypass these entirely — they go directly to specific URLs from training data.

### How Agents Actually Use Documentation

Key finding from the Agent Skill Report (578 patterns validated):

- Agents **rarely search** for docs. They retrieve URLs from "memory" (training data) and fetch them directly.
- Agents **skip long pages**. Content past truncation points (~150K characters in Claude Code) is completely invisible. The agent doesn't know it's missing.
- Agents **don't know about llms.txt by default**. You must tell them.
- Agents **don't know about .md URL variants** (appending .md for markdown). You must teach them via persistent context.
- **GitHub raw URLs** were the most reliable access pattern overall.
- **JavaScript-rendered docs** are completely opaque to agents.

---

## 5. Anti-Patterns That Confuse AI Agents

### Documentation Anti-Patterns (Ranked by Impact)

**1. Prose paragraphs without commands**
```markdown
<!-- BAD -->
We value clean, well-tested code. Our team follows TDD principles
and believes in comprehensive test coverage.

<!-- GOOD -->
- Test: `pytest -v --tb=short`
- Minimum coverage: `pytest --cov=app --cov-fail-under=80`
```
The agent reads prose, represents it as a vague preference, and ignores it.

**2. Ambiguous directives**
```markdown
<!-- BAD -->
- Be careful with database migrations
- Optimize queries where possible
- Handle errors gracefully

<!-- GOOD -->
- Run `alembic check` before applying migrations. Abort if downgrade path is missing.
- All queries must use parameterized inputs. No string concatenation.
```

"Careful" isn't a constraint. "Where possible" isn't a trigger condition. "Gracefully" isn't a behavior specification.

**3. Contradictory priorities without ordering**
```markdown
<!-- BAD -->
- Move fast and ship quickly
- Ensure comprehensive test coverage
- Keep the runtime budget under 5 minutes
- Run the full integration test suite before every commit

<!-- GOOD -->
Priority 1: Tests pass.
Priority 2: Under 5 minutes.
Priority 3: Ship fast.
```

ICLR 2026 research (AMBIG-SWE) found that conflicting instructions drop agent resolve rates from 48.8% to 28%.

**4. Version-ambiguous documentation**
API changes across versions (renamed classes, deprecated methods, renamed parameters) cause agents to generate working code for the **wrong version** two-thirds of the time without version-pinned documentation.

**5. Placeholder examples**
Using `[replace-with-actual-path]` or `TODO: add example` forces agents to guess. Always use concrete, real values.

**6. Welcome language and introductions**
"Welcome to..." and "This document explains..." waste tokens. Agents prioritize actionable information.

**7. Duplicating content from other sources**
Creates version conflicts, maintenance burden, and wastes context by loading the same information twice.

**8. Stating obvious standard practices**
"Run tests" and "write clean code" reduce credibility and waste token space that could convey project-specific insights.

**9. Style guides without enforcement commands**
Unless you include the exact linting command that enforces the style, the agent has no mechanism to verify compliance. Instructions without verification commands are suggestions, not rules.

---

## 6. Documenting Constraints, Invariants, and "Don'ts"

### Three-Tier Constraint Architecture

The most effective framework (source: BSWEN, March 2026) organizes constraints hierarchically:

**IRON LAWS** — Non-negotiable invariants. Violations block everything.
```markdown
## IRON LAWS (Never Violate)
- All monetary values MUST use `Decimal`, never `float`
- All currency operations MUST use banker's rounding
- Transform can only CREATE new entities/relations, never UPDATE existing ones
- Controller.dispatch() is the SINGLE entry point for triggering any EventSource
```

**DANGER ZONES** — High-risk areas requiring explicit approval.
```markdown
## DANGER ZONES (Requires Explicit Approval)
- Authentication middleware: do not modify without review
- Payment processing: all changes require security audit
- Database migration files: run `alembic check` before applying
```

**METRICS** — Success criteria optimized within constraints above.
```markdown
## METRICS (Optimize Within Constraints)
- Test coverage: minimum 80%
- Bundle size: under 500KB
- Build time: under 5 minutes
```

### Writing Effective "Don'ts"

The key insight: **if an AI agent loses track of WHY a constraint exists, it will optimize around it.**

```markdown
## Common Mistakes to Avoid

DON'T: Manually specify entity IDs
```typescript
// WRONG: Let the framework generate IDs
const user = Entity.create({ id: 'user-123', name: 'User' })
```
WHY WRONG: The framework manages ID generation. Manual IDs cause conflicts.

DO: Let the framework assign IDs
```typescript
// CORRECT
const user = Entity.create({ name: 'User' })
```

---

DON'T: Use Transform to update existing entities
```typescript
// WRONG: Transform creates, doesn't update
const updateUser = Transform.create({
  sourceEntity: User,
  record: (event) => ({ ...existing, name: event.newName })
})
```
WHY WRONG: Transform can only create new entities/relations. Use StateMachine for updates.

DO: Use StateMachine for property updates
```typescript
// CORRECT
const userStatus = StateMachine.create({
  sourceEntity: User,
  property: 'status',
  states: { active: {}, inactive: {} },
  transitions: { activate: { from: 'inactive', to: 'active' } }
})
```
```

### Tests as Living Constraint Documentation

Tests function as machine-readable constraints that agents consult during implementation. High-quality tests ground agent behavior in concrete examples from your actual codebase rather than statistical patterns from training data.

```markdown
## Testing Constraints
- Test through Interactions, not direct storage operations
- Always specify attributeQuery in storage.find/findOne operations
- Use PGLiteDB for test database
- Test command: `vitest run --reporter=verbose`
```

---

## 7. Few-Shot Prompting Through Documentation

### The Mechanism

Few-shot prompting through documentation works by embedding 2-5 input-output examples that teach the agent a task through pattern recognition, without model retraining. The agent extracts patterns from the examples and applies them to novel queries.

### Optimal Structure

```markdown
## Creating a StateMachine Computation

### Example 1: Simple boolean state
```typescript
const approved = StateMachine.create({
  sourceEntity: Request,
  property: 'approved',
  states: {
    pending: { value: false },
    approved: { value: true }
  },
  transitions: {
    approve: { from: 'pending', to: 'approved', event: approveInteraction }
  }
})
```

### Example 2: Multi-state with conditions
```typescript
const orderStatus = StateMachine.create({
  sourceEntity: Order,
  property: 'status',
  states: {
    draft: { value: 'draft' },
    submitted: { value: 'submitted' },
    fulfilled: { value: 'fulfilled' }
  },
  transitions: {
    submit: { from: 'draft', to: 'submitted', event: submitInteraction },
    fulfill: { from: 'submitted', to: 'fulfilled', event: fulfillInteraction }
  }
})
```

### Anti-pattern: DON'T use Transform for this
```typescript
// WRONG — Transform creates, doesn't update state
const orderStatus = Transform.create({
  sourceEntity: Order,
  record: (event) => ({ status: 'submitted' })
})
```
```

### Research-Backed Best Practices

- **2-5 examples** is optimal. Strong accuracy gains from 1-2 examples, diminishing returns beyond 4-5 (mem0.ai, 2026).
- **Consistent formatting** across examples. The agent extracts structural patterns, so inconsistent formatting teaches the wrong lesson.
- **Accompany examples with brief instructions** to prevent the model from picking up unintended patterns.
- **Quality over quantity** — token costs increase linearly while accuracy gains plateau.
- **Contrastive examples** (showing DO and DON'T) achieve ~95% first-try accuracy vs. ~70% with positive-only examples (understandingdata.com empirical observations, 500+ generations).

---

## 8. Research Papers and Key Resources

### Academic Research

- **LAPIS: Lightweight API Specification for Intelligent Systems** (arxiv 2602.18541) — Token-efficient API description format achieving 85.5% token reduction vs OpenAPI.
- **AMBIG-SWE** (ICLR 2026) — Demonstrates that agents default to non-interactive behavior without explicit encouragement, dropping resolve rates from 48.8% to 28%.
- **Anchoring Effect in LLMs** (arxiv 2505.15392) — Information in context influences agent outputs even when not directly relevant. Prior URL patterns can cause agents to fabricate similar-looking URLs.

### Blog Posts and Industry Analysis

- **"AGENTS.md Patterns: What Actually Changes Agent Behavior"** — Blake Crosley. Controlled experiments showing which AGENTS.md patterns produce measurable behavioral changes. Most comprehensive empirical analysis.
- **"Agent-Friendly Docs"** — Dachary Carey (Feb 2026). 10-hour empirical study validating 578 coding patterns. Key findings on agent documentation access patterns.
- **"How to Write a Great agents.md: Lessons from 2,500+ Repositories"** — GitHub Blog. Analysis of real-world AGENTS.md files identifying common failures.
- **"Negative Examples in Documentation: Teaching LLMs Through Contrast"** — James Phoenix / Just Understanding Data. Empirical evidence that DO/DON'T patterns improve first-try accuracy from ~70% to ~90%.
- **"How We Made v0 an Effective Coding Agent"** — Vercel Blog. Architecture of dynamic system prompts, LLM Suspense, and autofixers.
- **"Write LLM-Friendly Docs"** — Fern (March 2026). Content negotiation, markdown serving, and llms.txt implementation.
- **"Version-Specific Documentation: Why Your AI Coding Assistant Gets It Wrong"** — Moshe (dev.to). Case study showing version-ambiguous docs cause wrong-version code 2/3 of the time.

### Specifications

- **AGENTS.md Specification** — agents.md (Agentic AI Foundation, Linux Foundation)
- **llms.txt Specification v1.1.1** — ai-visibility.org.uk
- **Agent-Friendly Documentation Spec (AFDS) v0.2.1** — agentdocsspec.com. 22 checks across 8 categories.
- **Cursor Rules Documentation** — cursor.sh/docs/rules

---

## 9. Actionable Recommendations for interaqt

Based on all findings, here are specific recommendations for interaqt's documentation strategy:

### Immediate Actions

1. **Create an AGENTS.md** at the project root with:
   - Build/test/lint commands (`vitest run`, etc.)
   - Definition of done (what exit codes prove success)
   - Escalation rules (when to stop, when to ask)
   - Task-organized sections (writing code, reviewing, testing)

2. **Restructure .cursor/rules/ by task domain**, not by topic:
   - When writing Entity definitions
   - When creating Computations
   - When writing Interactions
   - When testing

3. **Add contrastive examples** (DO/DON'T) for the framework's hardest constraints:
   - Transform creates, doesn't update → use StateMachine
   - Don't manually specify entity IDs
   - Controller.dispatch() is the single entry point
   - State nodes must be defined before use in StateMachine

4. **Keep each documentation page/section under 5,000 characters**. Agents truncate at ~150K characters, and many tools truncate much earlier. Smaller, focused pages win.

### Documentation Architecture

5. **Layer your documentation for different consumers:**
   - **Discovery layer**: llms.txt at docs root (curated index with .md URLs)
   - **Operational layer**: AGENTS.md / .cursor/rules/ (exact commands, constraints)
   - **Reference layer**: API docs with complete type schemas
   - **Learning layer**: Few-shot examples (2-5 per concept, with anti-patterns)

6. **Write for operations, not comprehension:**
   - Replace prose with commands
   - Every instruction should be verifiable by running something
   - Define closure explicitly ("done" = specific exit codes, not feelings)
   - Use "When [task]..." prefixes for context-dependent instructions

7. **Version-pin all documentation** — specify which version of the API each doc applies to. Never let version ambiguity creep in.

### Constraint Documentation

8. **Use the three-tier constraint system:**
   - IRON LAWS: Non-negotiable invariants (Klass pattern, explicit control, dependency direction)
   - DANGER ZONES: High-risk areas (storage layer, computation engine)
   - METRICS: Optimizable targets (test coverage, performance)

9. **Always explain WHY** alongside constraints. If the agent loses track of the reason, it will optimize around the constraint.

10. **Use consistent markers** throughout all documentation:
    - `MUST` / `MUST NOT` for iron laws
    - `DON'T:` / `DO:` for contrastive examples
    - `WHY WRONG:` / `WHY RIGHT:` for explanations
    - `Priority 1/2/3:` for ordered constraints

### Format Guidelines

11. **Prefer bullet points and headers over prose paragraphs.** Agents scan for actionable items, not reading comprehension.

12. **Use concrete values, never placeholders.** Replace `[your-path-here]` with actual file paths from the project.

13. **Front-load the most critical instructions.** Context windows truncate from the end — put commands and constraints before style preferences.

14. **Test your documentation by asking the agent to recite it.** What it can't recite, it won't follow.
