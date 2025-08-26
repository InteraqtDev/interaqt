# Task 1: Requirements Analysis and Test Case Design

**📖 START: Read `docs/STATUS.json` to check current progress before proceeding.**

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1",
  "completed": false
}
```

## Task 1.1: Deep Requirements Analysis

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.1",
  "completed": false
}
```
- Analyze user business requirements, supplement vague or missing details
- Analyze from data perspective: identify all entities, properties, relationships
- Analyze from interaction perspective: list all user operations, permission requirements, business processes

**🔴 CRITICAL: Entity and Relation Deletion Analysis**
- For each Entity and Relation, analyze deletion requirements:
  - **Can it be deleted?** (Yes/No with business justification)
  - **Deletion type:** Soft delete (mark as deleted but keep data) or Hard delete (permanently remove)
  - **Soft delete implementation:** Add explicit `isDeleted: boolean` property to entity
  - **Cascade behavior:** What happens to related entities/relations when deleted
  - Example:
    ```
    User Entity:
    - Can be deleted: Yes (account deactivation)
    - Deletion type: Soft delete (preserve historical data for audit)
    - Implementation: Add isDeleted: boolean property
    - Cascade: Soft delete all user's posts, but keep comments for context
    
    PointDeduction Entity:
    - Can be deleted: No (audit trail requirement)
    - Deletion type: N/A (permanent record)
    ```

**🔴 CRITICAL: Property Modification Analysis**
- For each Entity property, analyze modification constraints:
  - **Immutable after creation:** Cannot be changed once set (e.g., creation timestamp, user ID)
  - **Modifiable with restrictions:** Can be changed under certain conditions (e.g., only by admin, only before approval)
  - **Freely modifiable:** Can be changed anytime (e.g., user profile description)
  - Example:
    ```
    User Entity Properties:
    - id: Immutable after creation (system generated)
    - email: Modifiable with restrictions (email verification required)
    - name: Freely modifiable
    - createdAt: Immutable after creation (audit requirement)
    - points: Modifiable with restrictions (only via point deduction/reward interactions)
    - isDeleted: Modifiable with restrictions (only via delete interactions)
    ```

**🔴 CRITICAL: Entity Design Principle**
- **NEVER include reference IDs as entity properties!**
- ❌ WRONG: Entity has properties like `userId`, `postId`, `requestId`, `dormitoryId`
- ✅ CORRECT: Use Relations to connect entities - Relations define the property names for accessing related entities
- Example:
  ```
  ❌ WRONG:
  PointDeduction entity with property: userId: string

  ✅ CORRECT:
  UserPointDeductionRelation defines:
  - source: User 
  - sourceProperty: 'pointDeductions' (accessed related PointDeduction via property 'pointDeductions')
  - target: PointDeduction 
  - targetProperty: 'user' (accessed via property 'user')
  ```
- Entity properties should ONLY contain:
  - Primitive data specific to that entity (name, status, points, timestamp)
  - NO references to other entities (those belong in Relations)

- Create `requirements/detailed-requirements.md` document

**✅ END Task 1.1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.1",
  "completed": true
}
```

## Task 1.2: Test Case Documentation (CRITICAL)

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.2",
  "completed": false
}
```
Create `requirements/test-cases.md` document with complete test cases:

**🔴 CRITICAL: All test cases MUST be based on Interactions, NOT on Entity/Relation operations**

**Test cases should be organized in phases:**
1. **Core Business Logic Tests** (implement first)
2. **Permission Tests** (implement after core logic works)
3. **Business Rule Tests** (implement after core logic works)

```markdown
## TC001: Create Article (via CreateArticle Interaction)
- Interaction: CreateArticle
- Preconditions: User logged in with publishing permission
- Input Data: title="Tech Sharing", content="Content...", tags=["frontend", "React"]
- Expected Results:
  1. Create new article record
  2. Article status is draft
  3. Creation time is current time
  4. Author linked to current user
  5. User's article count automatically +1
- Post Validation: Article appears in user's article list

## TC002: Create Article with Invalid Data (via CreateArticle Interaction)
- Interaction: CreateArticle
- Preconditions: User logged in with publishing permission
- Input Data: title="", content=""  // Empty required fields
- Expected Results:
  1. Interaction returns error
  2. Error type is "validation failed"
  3. No article record created
  4. User's article count unchanged
- Note: Do NOT test this with storage.create - it bypasses validation!

## TC003: Like Article (via LikeArticle Interaction)
- Interaction: LikeArticle
- Preconditions: Article exists and user hasn't liked it
- Input Data: postId="post123"
- Expected Results:
  1. Create like relationship record
  2. Article's like count automatically +1
  3. User's like list includes this article
- Exception Scenario: Duplicate like should fail at Interaction level

## TC004: Request Leave - Business Rule Test (via RequestLeave Interaction)
- Interaction: RequestLeave
- Test Phase: Business Rules (implement after core logic)
- Preconditions: User has already requested 3 leaves this month
- Input Data: reason="Family matter", days=2
- Expected Results:
  1. Interaction returns error
  2. Error message indicates monthly limit exceeded
  3. No new leave request created
  4. User's leave count remains at 3
- Note: This tests business rule validation, not core functionality
```

**✅ END Task 1.2: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.2",
  "completed": true
}
```

## Task 1.3: Interaction Matrix

**🔄 Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1.3",
  "completed": false
}
```
Create `requirements/interaction-matrix.md` to ensure:
- Every user role has corresponding Interactions for all operations
- Every Interaction has clear permission controls or business rule constraints
- Every Interaction has corresponding test cases
- Document both access control requirements AND business logic validations


**✅ END Task 1: Update `docs/STATUS.json`:**
```json
{
  "currentTask": "Task 1",
  "completed": true,
  "completedItems": [
    "detailed-requirements.md created",
    "test-cases.md created",
    "interaction-matrix.md created"
  ]
}
```

**🛑 STOP: Task 1 completed. Wait for user instructions before proceeding to Task 2.**
