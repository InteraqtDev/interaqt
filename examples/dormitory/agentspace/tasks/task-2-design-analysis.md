# Task 2: Design and Analysis

**📖 START: Read `docs/STATUS.json` to check current progress before proceeding.**

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2",
  "completed": false
}
```

## 🔴 Document-First Approach
**Task 2 focuses on creating comprehensive design documents before any code generation.**

## Task 2.1: Data Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.1",
  "completed": false
}
```
**📖 Follow strictly according to `./agentspace/knowledge/generator/data-analysis.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**Use the Analysis Documentation Template from `data-analysis.md` to create your `docs/data-design.json`**

**✅ END Task 2.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.1",
  "completed": true
}
```

## Task 2.2: Interaction Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.2",
  "completed": false
}
```
**📖 MUST READ: `./agentspace/knowledge/generator/basic-interaction-generation.md`**

⚠️ **DO NOT proceed without reading the above reference document completely!**

**Create `docs/interaction-design.md` documenting:**

- [ ] All interactions identified from use cases
- [ ] For each interaction:
  - Name and purpose
  - Required payload fields
  - Which entities/relations it affects
  - Expected outcomes
  - Permission requirements (for Stage 2)
  - Business rules (for Stage 2)
- [ ] **IMPORTANT**: Design interactions for core business logic first:
  - Basic CRUD operations
  - State transitions
  - Relationship management
- [ ] **Document but don't implement yet**:
  - Permission checks (role-based access control)
  - Business rule validations (e.g., quantity limits, state checks, time restrictions)
  - Complex data validations beyond basic field requirements

**Example structure:**
```markdown
# Interaction Design

## CreateDormitory
- **Purpose**: Create a new dormitory
- **Payload**:
  - name: string (required)
  - capacity: number (required, 4-6)
- **Effects**:
  - Creates new Dormitory entity
  - Initializes with empty beds
- **Stage 2 - Permissions**: Only admin can create
- **Stage 2 - Business Rules**: Capacity must be 4-6

## AssignUserToDormitory
- **Purpose**: Assign a student to a dormitory
- **Payload**:
  - userId: string
  - dormitoryId: string
- **Effects**:
  - Creates UserDormitoryRelation
  - Updates dormitory occupancy count
- **Stage 2 - Permissions**: Admin or dormHead of target dormitory
- **Stage 2 - Business Rules**: 
  - User must not already be assigned
  - Dormitory must have available capacity
```

**✅ END Task 2.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.2",
  "completed": true
}
```

## Task 2.3: Computation Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2.3",
  "completed": false
}
```
**📖 PRIMARY GUIDE: `./agentspace/knowledge/generator/computation-analysis.md`**
**📖 REFERENCE ONLY: `./agentspace/knowledge/generator/computation-implementation.md`**

⚠️ **CRITICAL: You MUST strictly follow the systematic process in `computation-analysis.md`!**

**🔴 MANDATORY PROCESS:**
1. **FIRST**: Read and understand `computation-analysis.md` completely
2. **USE PREVIOUS OUTPUTS**: Base your analysis on:
   - `docs/data-design.json` (from Task 2.1)
   - `docs/interaction-design.md` (from Task 2.2)
3. **ANALYZE**: For EVERY entity and EVERY property, follow the step-by-step analysis process
4. **DOCUMENT**: Create `docs/computation-analysis.json` documenting your analysis for each entity/property
5. **REFERENCE**: Use `computation-implementation.md` as a reference for syntax and examples

**Key Steps from computation-analysis.md:**
- [ ] Create analysis document at `docs/computation-analysis.json`
- [ ] Analyze each entity systematically (creation source, update requirements, deletion strategy)
- [ ] Analyze each property individually (type, purpose, data source, update frequency)
- [ ] Analyze each relation's complete lifecycle (creation, updates, deletion)
- [ ] Select appropriate computation type based on decision trees
- [ ] Document reasoning for each computation decision
- [ ] Follow the relation decision algorithm EXACTLY for relations

**Remember**: The systematic analysis process ensures you select the RIGHT computation type for each use case. This analysis will guide your implementation in the next phase!

**✅ END Task 2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 2",
  "completed": true,
  "completedItems": [
    "data-design.json created",
    "interaction-design.md created",
    "computation-analysis.json created"
  ]
}
```

**🛑 STOP: Task 2 completed. Wait for user instructions before proceeding to Task 3.**
