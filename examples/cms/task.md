# CMS Backend Implementation Task

## Project Overview
A CMS system for product operations personnel to manage preset data online, built using the InterAQT framework.

## Core Requirements
- **Entity**: Style objects with fields (id, label, slug, description, type, thumbKey, priority, status, createdAt, updatedAt)
- **Features**: Sorting support, version management, rollback capability  
- **User Roles**: 
  - admin: All permissions
  - operator: Manage styles but no delete/rollback
  - viewer: Read-only access

## Progress Summary

### ✅ Phase 1: Requirements Analysis (Complete)
- Created `detailed-requirements.md` with comprehensive entity/relation/interaction analysis
- Created `test-cases.md` with 20 test cases (TC001-TC020) covering all scenarios
- Created `interaction-matrix.md` with permission matrix and coverage verification

### ✅ Phase 2: Backend Implementation (Complete with Issues)
Successfully created:
- **Entities**: User, Style, Version
- **Relations**: UserStyleRelation, StyleVersionRelation, UserVersionRelation
- **Interactions**: 
  - Style: CreateStyle, UpdateStyle, DeleteStyle, PublishStyle, UpdateStyleOrder
  - Version: RollbackVersion
  - Query: GetStyles, GetStyleDetail, GetVersionHistory

Key implementation decisions:
- Used Transform for entity creation (in Entity computedData)
- Used StateMachine for status/timestamp updates
- Implemented soft delete with status='offline'
- Used Attributive functions for permission checks

### ⚠️ Phase 3: Testing (Attempted - Failed)
Created comprehensive test suite but encountered critical issues:

#### Issues Encountered:
1. **StateMachine Transfer Error**
   - TypeError: Cannot read properties of undefined reading '_type'
   - Indicates improper StateNode reference setup

2. **Permission Check Error**
   - Returns "check user failed" instead of "permission denied"
   - Suggests Attributive function implementation issue

3. **Database Query Issues**
   - Created records not found in subsequent queries
   - Likely missing attributeQuery parameters in storage.find/findOne calls

4. **Missing Validations**
   - Slug uniqueness not implemented
   - Need to add validation logic in interactions

### 🔧 Phase 4: Frontend Implementation (Not Started)

### 🔧 Phase 5: Backend Quality Assurance (Not Started)

## Next Steps

### Immediate Fixes Required:

1. **Fix StateMachine Setup**
   ```typescript
   // Ensure StateNode variables are declared before use
   const activeState = StateNode.create({ name: 'active' });
   const offlineState = StateNode.create({ name: 'offline' });
   // Then reference in StateMachine and StateTransfer
   ```

2. **Fix Database Queries**
   ```typescript
   // Always include attributeQuery parameter
   const style = await system.storage.findOne(
     'Style',
     MatchExp.atom({ key: 'id', value: ['=', styleId] }),
     undefined,
     ['id', 'label', 'slug', 'status', 'priority', 'createdAt', 'updatedAt']
   );
   ```

3. **Implement Slug Uniqueness Validation**
   - Add validation in CreateStyle and UpdateStyle interactions
   - Check for existing slug before creating/updating

4. **Fix Permission Checks**
   - Review Attributive function implementation
   - Ensure proper error messages for permission failures

### Implementation Order:
1. Recreate backend files with fixes
2. Run tests iteratively, fixing issues one by one
3. Ensure all 8 test cases pass
4. Complete remaining phases

## Test Cases to Pass:
1. ✅ Should setup test environment
2. ❌ Admin should create style (TC001)
3. ❌ Should prevent duplicate slug (TC002 - Edge Case)
4. ❌ Admin should publish style (TC007)
5. ❌ Admin should rollback to version (TC011)
6. ❌ Should handle version history (TC018 - Complex)
7. ❌ Should update style ordering (TC019 - Complex)
8. ❌ Should enforce permissions (TC020 - Security)

## Error Log Format
When fixing issues, document each attempt:
```
### Attempt N: [Issue Description]
**Error**: [Error message]
**Analysis**: [What caused the error]
**Fix**: [What was changed]
**Result**: [Success/Failure]
```

## Success Criteria
- All 8 test cases pass
- No TypeScript errors
- Proper error handling and validation
- Clear separation of concerns
- Following InterAQT best practices