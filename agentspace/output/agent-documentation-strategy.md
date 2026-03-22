# Documentation Strategy for AI Agent Code Generation

> How to write documentation that makes AI coding agents produce high-quality interaqt code on the first try.

---

## Core Thesis

AI agents do not read documentation like humans. They are pattern matchers operating on retrieved text. This means:

- **Prose-heavy conceptual guides** get truncated or ignored.
- **Ambiguous directives** ("handle errors gracefully") produce inconsistent output.
- **Positive-only examples** teach the happy path but leave agents free to invent wrong alternatives.
- **Scattered information** forces agents to synthesize across documents, a task they perform poorly.

The goal is to write **documentation that, when injected into an agent's context window, maximizes the probability of correct code on the first attempt**.

But there is a prerequisite that trumps all writing advice: **a document that never enters the agent's context is worthless, no matter how well-written.** Documentation strategy must start from the delivery mechanism, not the content.

---

## Part I: The Delivery Problem

### How Documents Enter an Agent's Context

There are exactly four ways a document reaches an agent:

| Mechanism | Reliability | Example |
|-----------|------------|---------|
| **Auto-injection** by tool infrastructure | Guaranteed | `.cursorrules`, `CLAUDE.md`, `AGENTS.md` |
| **Agent self-retrieval** via file read | Only if agent knows the path | Agent reads a file it found in the project tree |
| **RAG / semantic search** by tool | Unreliable, tool-specific | Cursor `@docs`, codebase indexing |
| **User explicit instruction** | Unreliable, requires user effort | "Read docs/patterns.md first" |

Only mechanism 1 is reliable. Mechanism 2 works if the agent is told where to look — which requires mechanism 1 to bootstrap it. Mechanisms 3 and 4 cannot be designed for.

### The Implication

A documentation architecture with 20 perfectly organized files across 4 directories is worthless if the agent has no reliable way to discover which file to read for a given task. **Fewer files that reliably enter context beat many files that don't.**

---

## Part II: The Consolidated Architecture

### Design Principle

Minimize the number of files. Maximize the probability that each file enters context.

### The Deliverable Structure

```
.cursorrules / CLAUDE.md          ← Auto-injected: iron laws + routing table
docs/
├── interaqt-patterns.md          ← One file: all core patterns + contrastive examples
├── interaqt-recipes.md           ← One file: 3-5 complete runnable scenarios
└── interaqt-reference.md         ← One file: all API signatures + parameter tables
```

**Four files total.** Here's why each exists and how it enters context:

| File | Token Budget | Delivery Mechanism |
|------|-------------|-------------------|
| `.cursorrules` / `CLAUDE.md` | ~800 | Auto-injected by tool. Always in context. |
| `docs/interaqt-patterns.md` | ~5000 | Agent reads it because the rules file says to. |
| `docs/interaqt-recipes.md` | ~4000 | Agent reads it when building a complete feature. |
| `docs/interaqt-reference.md` | ~3000 | Agent reads it when checking specific API details. |

Total documentation surface: ~13,000 tokens. Well within context window limits for any modern agent.

---

## Part III: File 1 — The Rules File (Auto-Injected)

This file is the only one guaranteed to be in context. It carries two responsibilities:

1. **Iron-law constraints** that must never be violated.
2. **A routing table** that tells the agent which file to read for each task type.

### Template

```markdown
# interaqt Framework Rules

## Documentation Index

BEFORE writing any interaqt code, read the relevant documentation file:

| Task | Read this file |
|------|---------------|
| Any interaqt code generation | docs/interaqt-patterns.md |
| Building a complete feature from scratch | docs/interaqt-recipes.md |
| Checking API signatures or parameters | docs/interaqt-reference.md |

## Iron Laws

### Import
ALWAYS use `import { ... } from 'interaqt'`.
NEVER use `'@interaqt/runtime'`, `'interAQT'`, or any other path.

### Naming
The project name is **interaqt** (all lowercase).
NEVER write InterAQT, interAQT, InterAqt, or Interaqt.

### Explicit Control
NEVER add implicit behavior not declared by the user.
NEVER auto-generate IDs — the framework generates them via the Klass pattern.
NEVER assume a relation type — ALWAYS explicitly set '1:1', '1:n', 'n:1', or 'n:n'.

### Computation Scope
Transform CREATES new records in a COMPUTED entity. It CANNOT update properties on existing entities.
StateMachine UPDATES a property value on an EXISTING entity in response to events.
NEVER attach Transform to a Property computation. Transform belongs on Entity computation.

### Storage Queries
ALWAYS pass `attributeQuery` to `storage.find()` and `storage.findOne()`.
Use `['*']` for all fields, or list specific field names.

### Controller Lifecycle
ALWAYS call `controller.setup(true)` BEFORE any `controller.dispatch()`.

### Testing
ALWAYS use `controller.dispatch()` to trigger actions in tests.
NEVER mutate storage directly in tests.
Use PGLiteDB for test databases.

## Never List

1. NEVER use import paths other than `'interaqt'`
2. NEVER assign manual UUIDs to Klass instances
3. NEVER use Transform to update existing entity properties
4. NEVER omit `attributeQuery` from storage.find/findOne calls
5. NEVER omit relation `type`
6. NEVER mutate storage directly in tests
7. NEVER call controller.dispatch() before controller.setup()
8. NEVER add implicit/default behavior
9. NEVER create circular dependencies between computations
10. NEVER capitalize the project name
```

### Why This Structure Works

- The routing table is at the top, so the agent sees it immediately.
- Iron laws use NEVER/ALWAYS — absolute imperatives with no qualifiers.
- The Never list is redundant with the iron laws on purpose — repetition reinforces constraints.
- Total size ~800 tokens — small enough to always be in context without pressure.

---

## Part IV: File 2 — The Patterns File

This is the workhorse document. It teaches the agent how to use every core concept correctly. It uses **task-oriented headers** (not concept-oriented) and **contrastive DO/DON'T pairs** for every pattern.

### Why Contrastive Pairs Are Non-Negotiable

Empirical data on AI agent code generation accuracy:

| Documentation Style | First-Try Accuracy |
|---|---|
| API reference only | ~50% |
| Positive examples only | ~70% |
| Positive + Negative examples | ~90% |
| Explained contrast (with WHY WRONG) | ~95% |

Every pattern MUST include at least one WRONG/CORRECT pair. The wrong examples are not decorative — they are the primary mechanism by which the agent learns the boundaries of correct usage.

### Structure

The patterns file uses task-oriented section headers. Each section follows this template:

```markdown
## When [Doing X]

[Canonical code example — complete, compilable, with imports]

### WRONG: [Label]
```typescript
// DON'T — [why this is wrong]
[incorrect code]
```

### CORRECT:
```typescript
[correct version]
```

### WHY
[1-2 sentences explaining the reasoning]

### Checklist
- [Verification item 1]
- [Verification item 2]
```

### Sections to Include

The patterns file should contain these sections, in this order:

1. **When Defining Entities and Properties**
   - Entity.create with properties
   - Property types: string, number, boolean, collection
   - Contrastive: manual UUID assignment (WRONG) vs letting framework generate (CORRECT)

2. **When Defining Relations**
   - Relation.create with source, target, sourceProperty, targetProperty, type
   - Contrastive: omitting type (WRONG) vs explicit type (CORRECT)
   - Contrastive: wrong directionality for 1:n (WRONG) vs correct source/target (CORRECT)

3. **When Adding Reactive Computations**
   - Decision tree: which computation type to use
   - Transform — creates computed entity from source entity
   - StateMachine — updates property value on state transitions
   - Count — tracks cardinality
   - Summation / Average — numeric aggregates
   - Contrastive: Transform on Property (WRONG) vs Transform on Entity (CORRECT)
   - Contrastive: Transform for updates (WRONG) vs StateMachine for updates (CORRECT)
   - Contrastive: missing attributeQuery in Transform (WRONG) vs explicit attributeQuery (CORRECT)

4. **When Creating Interactions**
   - Interaction.create with action, payload, conditions
   - Action types: create, update, delete
   - PayloadItem for data input
   - Contrastive: direct storage mutation (WRONG) vs Interaction-based (CORRECT)

5. **When Setting Up the Controller**
   - MonoSystem + DB driver
   - Controller constructor with entities, relations, eventSources
   - controller.setup(true) for installation
   - Contrastive: dispatch before setup (WRONG) vs setup then dispatch (CORRECT)

6. **When Dispatching Events**
   - controller.dispatch(interaction, { user, payload })
   - Reading results from dispatch
   - Contrastive: wrong payload shape (WRONG) vs matching PayloadItem names (CORRECT)

7. **When Querying Data**
   - storage.find with entity name, match expression, attributeQuery
   - BoolExp and MatchExp for filtering
   - Nested attributeQuery for relations
   - Contrastive: omitting attributeQuery (WRONG) vs explicit attributeQuery (CORRECT)

8. **When Writing Tests**
   - Test structure with Vitest
   - PGLiteDB setup
   - Dispatching then asserting
   - Contrastive: direct storage create in test (WRONG) vs dispatch (CORRECT)

### Writing Principles for This File

- **Code first, prose second.** Lead every section with a complete code example. Explain after.
- **Every section is self-contained.** Include imports in every code block. Never say "see above."
- **Use consistent markers.** `### WRONG:` / `### CORRECT:` / `### WHY` / `### Checklist` — always these exact headings.
- **No ambiguous language.** Never write "you might want to", "consider", "it's recommended". Write "ALWAYS", "NEVER", "MUST".

---

## Part V: File 3 — The Recipes File

Agents struggle most when combining multiple concepts. The patterns file teaches individual patterns; the recipes file teaches assembly.

### Structure

Each recipe is a complete, runnable example covering a realistic use case. Not a sketch — full code from imports to dispatch calls and assertions.

```markdown
# Recipe: [Use Case Name]

## Scenario
[2-3 sentences describing what we're building and why]

## Complete Implementation

```typescript
import { ... } from 'interaqt'

// --- Entities ---
...

// --- Relations ---
...

// --- Computations ---
...

// --- Interactions ---
...

// --- Controller Setup ---
...

// --- Usage ---
...
```

## Design Decisions
- [Why this computation type was chosen]
- [Why this relation cardinality was chosen]
- [What would break if you changed X]
```

### Recipes to Include

Choose 3-5 recipes that collectively cover the framework's surface area. Each recipe should exercise concepts the others don't:

| Recipe | Concepts Exercised |
|--------|-------------------|
| Blog with author stats | Entity, Relation (1:n), Count, Interaction (create), Query with nested attributeQuery |
| Order workflow | Entity, StateMachine, StateNode, StateTransfer, Interaction (update), multiple state transitions |
| Computed leaderboard | Entity, Relation, Summation, Transform (derived entity), filtered results |
| Access-controlled resource | Entity, Interaction with guards, userAttributives, conditions, payload validation |

### Writing Principles for This File

- **Every recipe must compile and run.** Test it. If it doesn't run, it teaches the agent broken patterns.
- **Include the dispatch calls.** Don't stop at defining the data model. Show how the system is used end-to-end.
- **Include assertions or expected output.** The agent needs to know what correct behavior looks like.
- **Design Decisions section is mandatory.** It teaches the agent the "why" behind choices, not just the "what." Without it, the agent will make different (wrong) choices when adapting the recipe to a new scenario.

---

## Part VI: File 4 — The Reference File

The reference file is a compact lookup table for API details. The agent consults it when it knows which API to use but needs exact parameter names, types, or constraints.

### Structure

```markdown
## Entity.create

```typescript
Entity.create(args: EntityCreateArgs, options?: { uuid?: string }): EntityInstance

interface EntityCreateArgs {
  name: string
  properties: PropertyInstance[]
  computation?: ComputationInstance
  isRef?: boolean
}
```

Constraints:
- `name` must be unique across all entities
- NEVER pass `uuid` in options — let the framework generate it

---

## Relation.create
...
```

### What to Include

One section per public API, each containing:

1. **Full TypeScript signature** including the args interface
2. **Constraints** — non-obvious rules as bullet points
3. No prose explanations, no examples (those are in the patterns file)

### APIs to Cover

- Entity.create, Property.create, Relation.create
- Transform.create, StateMachine.create, StateNode.create, StateTransfer.create
- Count.create, Summation.create, Average.create
- Interaction.create, Action.create, Payload.create, PayloadItem.create
- Controller constructor, controller.setup, controller.dispatch
- storage.find, storage.findOne, storage.create, storage.update, storage.delete
- BoolExp.atom, BoolExp.and, BoolExp.or, MatchExp.atom

### Writing Principles for This File

- **Type signatures are the content.** Don't paraphrase types in prose.
- **Constraints only where non-obvious.** Don't state things the type system already enforces.
- **Keep it compact.** This file should be the smallest of the three.

---

## Part VII: Cross-Cutting Writing Principles

These principles apply to all four files.

### 1. WHY Fields Are Not Optional

When agents encounter a constraint without justification, they treat it as a soft preference and will violate it to satisfy other goals. Including the reason makes the constraint sticky.

```
NEVER manually assign `uuid` to an Entity instance.

WHY: The Klass pattern uses `generateUUID()` internally to ensure
globally unique identifiers. Manual IDs risk collisions and break
serialization round-trips.
```

Without `WHY`, the agent may decide "the user probably wants a specific ID here" and override the constraint. With `WHY`, the agent understands the system invariant and respects it.

### 2. Absolute Language Only

| Weak (agent ignores) | Strong (agent follows) |
|---|---|
| "You should consider..." | "ALWAYS..." |
| "It's best practice to..." | "NEVER..." |
| "Where possible, avoid..." | "MUST..." |
| "Try to..." | "[do X]" |
| "Be careful with..." | "NEVER [do X]. WHY: ..." |

Agents parse absolute imperatives reliably. They parse hedged recommendations inconsistently.

### 3. Code Before Prose

Lead every section with a code example. Agents parse code more reliably than natural language. Prose serves as disambiguation, not as the primary teaching mechanism.

```markdown
## WRONG ORDER (prose first):

Relations connect two entities. The source and target determine
directionality, and the type field specifies cardinality...

```typescript
const r = Relation.create({ ... })
```

## CORRECT ORDER (code first):

```typescript
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

Each User has many Posts (1:n). `sourceProperty` and `targetProperty`
define how each side navigates the relation.
```

### 4. Self-Contained Sections

Every code block must include its own imports. Never assume the agent has seen a previous section. If a section references entities defined elsewhere, re-define them minimally:

```typescript
// Re-declare for this example
const User = Entity.create({ name: 'User', properties: [...] })
const Post = Entity.create({ name: 'Post', properties: [...] })

// The actual pattern being taught
const UserPosts = Relation.create({
  source: User,
  sourceProperty: 'posts',
  target: Post,
  targetProperty: 'author',
  type: '1:n'
})
```

### 5. Consistent Markers

Use the same heading markers across all files so agents can pattern-match on structure:

- `### WRONG:` — Incorrect code
- `### CORRECT:` — Correct code
- `### WHY` — Rationale for a constraint
- `### Checklist` — Verification items
- `## When [Doing X]` — Task-oriented section header (patterns file)
- `# Recipe: [Name]` — Complete scenario (recipes file)

---

## Part VIII: Validation and Iteration

### Testing Documentation Quality

1. **Zero-shot test**: Give an agent only your documentation and a task. Does it produce correct code?
2. **Error categorization**: When the agent makes mistakes:
   - **Missing information** → Add to patterns file
   - **Incorrect pattern** → Add a contrastive pair
   - **Constraint violation** → Strengthen the rules file
   - **Composition failure** → Add a recipe

### Iteration Cycle

```
1. Write the four documentation files
2. Test with agent on 10 representative tasks
3. Categorize each failure
4. For each failure:
   a. Missing info → Add to patterns file
   b. Wrong pattern → Add WRONG/CORRECT pair to patterns file
   c. Constraint violation → Add to Never list in rules file
   d. Composition failure → Add recipe to recipes file
5. Re-test
6. Repeat until >90% first-try accuracy
```

### Representative Task Set

Test these 10 tasks to cover the framework's surface:

1. Define two entities with a 1:n relation
2. Add a Count computation to track relation cardinality
3. Create an interaction that creates a record with payload
4. Write a StateMachine that transitions on interaction events
5. Define a Transform that derives a filtered entity
6. Set up a controller with entities, relations, and interactions
7. Write a test that dispatches an interaction and verifies the result
8. Create an Activity with multiple interactions and gateways
9. Query data with nested attributeQuery through relations
10. Combine Summation + Transform for a computed aggregate view

---

## Summary

```
┌──────────────────────────────────────────────────────────────────┐
│  FILE 1: .cursorrules / CLAUDE.md         (auto-injected, ~800) │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Routing table: task → file path                           │  │
│  │ Iron laws: NEVER/ALWAYS constraints                       │  │
│  │ Never list: 10 absolute prohibitions                      │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  FILE 2: docs/interaqt-patterns.md        (agent reads, ~5000)  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 8 task-oriented sections                                  │  │
│  │ Each: canonical example + WRONG/CORRECT pair + checklist  │  │
│  │ Covers: Entity, Relation, Computation, Interaction,       │  │
│  │         Controller, Dispatch, Query, Testing              │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  FILE 3: docs/interaqt-recipes.md         (agent reads, ~4000)  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 3-5 complete runnable scenarios                           │  │
│  │ Each: full code from imports to dispatch + assertions     │  │
│  │ Design decisions explained                                │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  FILE 4: docs/interaqt-reference.md       (agent reads, ~3000)  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ TypeScript signatures for all public APIs                 │  │
│  │ Parameter types from source interfaces                    │  │
│  │ Non-obvious constraints per API                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

Total: 4 files, ~13,000 tokens
Routing: Rules file tells agent which file to read for each task
Delivery: Rules file auto-injected → agent reads the rest on demand
```

The architecture is simple because the delivery problem is hard. Every additional file is a liability — it's one more document the agent might not find. Four files, each with a clear delivery mechanism, beat twenty files with perfect internal organization but no path into the agent's context.

Write for the machine. Deliver to the machine. Test with the machine. Iterate based on what the machine gets wrong.
