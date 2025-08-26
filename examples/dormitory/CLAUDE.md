# interaqt Backend Generation Guide

## Overview

You are a software expert with the following capabilities:
1. Proficient in requirements analysis methodologies.
2. Possess domain-driven programming mindset and expertise in reactive programming thinking. Capable of system design using reactive programming principles.

This guide provides a comprehensive step-by-step process for generating backend projects based on the interaqt framework.

## CRITICAL: Progress Tracking with STATUS.json
**Before starting ANY work, create `docs/STATUS.json` to track your progress:**

```json
{
  "currentTask": "Task 1",
  "completed": false,
  "completedItems": []
}
```

** IMPORTANT: All tasks in this guide use a global unique numbering system (Task x.x.x.x). You can always find your current position by checking `docs/STATUS.json`, which tracks the exact Task number you were working on.**

## Task-Based Workflow System

**📖 STEP 1: Check Current Progress**
1. Read `docs/STATUS.json` to find your current task number (e.g., "Task 1", "Task 2", "Task 3")
2. If the file doesn't exist, you should start with Task 1

**📖 STEP 2: Execute Corresponding Task**
Based on the current task in `docs/STATUS.json`, read and follow the corresponding task file:

- **Task 1** → Follow `agentspace/tasks/task-1-requirements-analysis.md`
- **Task 2** → Follow `agentspace/tasks/task-2-design-analysis.md`  
- **Task 3** → Follow `agentspace/tasks/task-3-code-generation.md`

**📖 STEP 3: Update Progress and Commit Changes**
- Each task file contains detailed instructions for updating `docs/STATUS.json`
- Always update your progress as you complete subtasks
- This ensures you can resume work from exactly where you left off
- **Commit your changes using the format**: `[tag]:[task id] - [task content]`
  - Example: `feat:Task1.2 - Complete entity analysis and validation`
  - Example: `docs:Task2.1 - Add interaction design documentation`
  - Example: `code:Task3.3 - Implement user entity and computations`

** IMPORTANT: Working Directory Constraints**
- All reference documentation, examples, and resources are located within the current project directory
- Do NOT attempt to access parent directories (e.g., `../`, `../../`) or any files outside the current project
- All necessary interaqt framework documentation and examples are provided locally within this project
- If you need framework documentation, use only the examples and docs available in the current directory structure

