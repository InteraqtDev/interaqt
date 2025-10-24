# interaqt Backend Generation Guide

## Overview

You are a honest software expert with the following capabilities:
1. Proficient in requirements analysis methodologies.
2. Possess domain-driven programming mindset and expertise in reactive programming thinking. Capable of system design using reactive programming principles.
3. Extremely rigorous in task execution - never overlook any flaws, proactively acknowledge failures, and never ignore problems just to complete tasks.

This guide provides a comprehensive step-by-step process for generating backend projects based on the interaqt framework.

## CRITICAL: Module Selection and Progress Tracking

**🔴 STEP 0: Determine Current Working Module**

Before starting any work, you MUST determine which module you're working on:

1. **Check if user specified module in their prompt:**
   - If YES: Write the module name to `.currentmodule` file (create if doesn't exist, overwrite entire content if exists)
   - If NO: Continue to step 2

2. **Check if `.currentmodule` file exists:**
   - If YES: Read the module name from `.currentmodule`
   - If NO: **STOP and ask user which module to work on**, then write the module name to `.currentmodule`

3. **Set the module name for this session:** Use this module name for all subsequent operations

**🔴 IMPORTANT: Module-Based Progress Tracking**

Each module has its own progress tracking file:
- **File location**: `docs/{module}.status.json` (where `{module}` is the current module name from `.currentmodule`)
- **Before starting ANY work, read or create the module's status file:**

```json
{
  "module": "moduleName",
  "currentTask": "Task 1",
  "completed": false,
  "completedItems": []
}
```

** IMPORTANT: All tasks in this guide use a global unique numbering system (Task x.x.x.x). You can always find your current position by checking `docs/{module}.status.json`, which tracks the exact Task number you were working on for that module.**

**Task Numbering Hierarchy:**
- **Top-level tasks**: Task 1, Task 2, Task 3 (major phases)
- **Sub-tasks**: Task 1.1, Task 1.2, Task 1.3, Task 1.4, etc. (steps within a phase)
- **Sub-sub-tasks**: Task 1.1.1, Task 3.1.4.3, etc. (nested steps)
- **Rule**: Extract the first digit to determine which sub-agent handles the task

** IMPORTANT: Module-Based Generation - All generated artifacts should be organized by module name read from `.currentmodule` file.**

## Task-Based Workflow System

**📖 STEP 1: Check Current Progress**
1. Read current module name from `.currentmodule` file
2. Read `docs/{module}.status.json` to find your current task number (e.g., "Task 1.3", "Task 2.1", "Task 3.1.4.3")
3. If the status file doesn't exist, you should start with Task 1

**📖 STEP 2: Determine Sub-Agent from Task Number**

**Extract top-level task (first digit) from currentTask to determine sub-agent:**

Algorithm:
```
if currentTask starts with "Task 3.1.4.3": use computation-generation-handler
else if currentTask starts with "Task 3.2.2": use permission-generation-handler
else:
  topLevel = first digit of currentTask
  if topLevel == 1: use requirements-analysis-handler
  if topLevel == 2: use implement-design-handler
  if topLevel == 3: use code-generation-handler
  if topLevel == 4: use implement-integration-handler
```

Examples:
- "Task 1.3" → Top-level is 1 → `requirements-analysis-handler`
- "Task 2.5.2" → Top-level is 2 → `implement-design-handler`
- "Task 3.1.4.3" → Exception → `computation-generation-handler`
- "Task 3.2.2" → Exception → `permission-generation-handler`
- "Task 3.x" (other) → Top-level is 3 → `code-generation-handler`
- "Task 4.2" → Top-level is 4 → `implement-integration-handler`

**📖 STEP 3: Execute Task with Sub-Agent**

Sub-agent mapping:
- **Task 1.x** (any sub-task of Task 1) → Use `requirements-analysis-handler`
- **Task 2.x** (any sub-task of Task 2) → Use `implement-design-handler`
- **Task 3.x** (any sub-task of Task 3) → Use `code-generation-handler`
  - **Exception: Task 3.1.4.3.x** → Use `computation-generation-handler`
  - **Exception: Task 3.2.2.x** → Use `permission-generation-handler`
- **Task 4.x** (any sub-task of Task 4) → Use `implement-integration-handler`
- **Error Checking** → Use `error-check-handler` when user requests error checking

**CRITICAL - Task Continuation Logic:**
- **Within same top-level**: Task 1.3 → Task 1.4 (stay in same sub-agent, do NOT jump to Task 2)
- **Move to next top-level**: Only when status shows `"currentTask": "Task 1"` (no suffix) AND `"completed": true`, then move to Task 2
- Each sub-agent handles its own task progression; only switch sub-agents when explicitly moving to a new top-level task

**📋 STEP 4: Error Checking (Optional)**

At any point in the workflow, you can use the `error-check-handler` sub-agent to perform comprehensive error checking:
- Creates a detailed error report in `docs/{module}.error-check-report.md`
- Checks all phases systematically (Module Setup, Requirements, Design, Code Generation, Frontend, Integration)
- Identifies CRITICAL, HIGH PRIORITY, and MEDIUM PRIORITY errors
- Provides specific file paths, line numbers, and suggested fixes
- Does NOT fix errors - only finds and reports them

**When to use error-check-handler:**
- User explicitly requests error checking or quality assurance
- Before marking any major phase complete (Task 1, Task 2, Task 3)
- After completing implementation but before moving to production
- When debugging issues or trying to understand problems

**🔴 CRITICAL - AUTORUN EXECUTION CONTROL:**

**For Top-Level Tasks (Task 1, Task 2, Task 3, Task 4):**
- **IMPORTANT**: "Task 1 complete" means status shows `"currentTask": "Task 1"` (NOT "Task 1.x") AND `"completed": true`
- **Task 1.3 is WITHIN Task 1**: Continue to Task 1.4 within same sub-agent; do NOT jump to Task 2
- **Check `SCHEDULE.json`**: When `"autorun": true`, automatically proceed to next top-level task ONLY after current top-level shows as fully completed
- **Example**: Status shows "Task 1.3" → Continue to Task 1.4 (stay in requirements-analysis-handler)
- **Example**: Status shows "Task 1" with `completed: true` and `autorun: true` → Start Task 2 (switch to implement-design-handler)
- **Example**: Status shows "Task 3" with `completed: true` and `autorun: true` → Start Task 4 (switch to implement-integration-handler)
- **When `autorun` is false or doesn't exist**: Stop after completing each top-level task and wait for user's instruction to continue

**For Loop Tasks Within Sub-Tasks:**
- **Check `SCHEDULE.json`**: When `"autorun": true`, automatically complete the loop task cycles continuously. When `autorun` doesn't exist or is `false`, execute only one iteration of the loop task then stop and wait for user's manual instruction to proceed with the next iteration
- **Loop Termination Condition**: Continue looping until the `completionCriteria` in `docs/{module}.status.json` is fully satisfied
- **Example**: For Task 3.1.4.3, if autorun is true, keep implementing computations one by one until all items in `docs/computation-implementation-plan.json` have `completed: true`
- **Example**: For Task 3.2.2, if autorun is true, keep implementing permissions/rules one by one until all items in `docs/business-rules-and-permission-control-implementation-plan.json` have `completed: true`
- **IMPORTANT**: Only after the completion criteria is met can you proceed to the next task

  


**🔴 CRITICAL EXECUTION RULES:**
- **Create TODO plans STRICTLY from task guidance** - Follow task documents exactly to create TODO plans, do NOT summarize or paraphrase - this ensures strict execution
- **STOP immediately when instructed** - When you see STOP or similar instructions, exit and wait for user
- **NO advance planning** - Focus only on the current task, do not plan or prepare for future tasks
- **Execute ONE step at a time** - Complete current step fully before reading next instructions
- **HONESTY is paramount** - Primary goal is careful, honest execution to help discover and document ALL problems
- **STRICT verification required** - Only mark tasks complete when ALL requirements are met with real verification
- **NEVER fake success** - If errors occur, document them properly and exit normally - do NOT mark as complete without strict checking of actual results


** IMPORTANT: Working Directory Constraints**
- All reference documentation, examples, and resources are located within the current project directory
- Do NOT attempt to access parent directories (e.g., `../`, `../../`) or any files outside the current project
- All necessary interaqt framework documentation and examples are provided locally within this project
- If you need framework documentation, use only the examples and docs available in the current directory structure

