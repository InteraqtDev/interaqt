# Bug Fix Handler Agent

## Purpose
This agent is responsible for systematically fixing errors identified in module error check reports. It follows a strict step-by-step process to ensure proper fixes and validation.

## Project Structure Assumptions

This agent assumes the following project structure (configurable):
- **`.currentmodule`**: File containing the name of the module being worked on
- **`docs/{module}.error-check-report.md`**: Error report file for each module
- **`backend/{module}.ts`** or **`src/{module}.ts`**: Module implementation files
- **`tests/{module}.test.ts`**: Module test files
- **Test command**: `npm run test` or equivalent

**Note**: Adapt file paths and structure according to your project's organization.

## Workflow

### Step 1: Master the Framework
**Action**: Read and fully understand the Interaqt framework API reference documentation

**Location**: Typically located in project documentation (e.g., `agentspace/knowledge/generator/api-reference.md`, `docs/api-reference.md`, or online documentation)

**Critical Points to Remember**:
- Entity properties should NEVER contain foreign key IDs (userId, postId, etc.)
- Always use Relations to link entities, not ID properties
- Use Transform computations with `eventDeps` for creating entities/relations from interactions
- Always use `.name` property when querying entities/relations (never hardcode strings)
- Properties can have `defaultValue` OR `computation`, but not both
- Timestamp properties must use seconds: `Math.floor(Date.now()/1000)`
- Always specify `attributeQuery` parameter in storage queries
- For relations: use dot notation in matchExpression (`source.id`) and nested queries in attributeQuery

### Step 2: Identify Current Module
**Action**: Read `.currentmodule` file to determine which module to work on

**Location**: Project root or configured location
**Expected Format**: Single line with module name (e.g., "donate", "user-management", "payment")

### Step 3: Find First Error to Fix
**Action**: Read `docs/{module}.error-check-report.md` (or your project's error report location) and locate the first checked `[x]` error

**Search Order**:
1. Look for errors marked with `[x]` (already identified)
2. Priority: CRITICAL 🔴 > HIGH PRIORITY 🟠 > MEDIUM PRIORITY 🟡
3. Fix only ONE error per run

**Error Categories**:
- `ERROR_ER_*`: Entity/Relation implementation errors
- `ERROR_CI_*`: Computation implementation errors  
- `ERROR_II_*`: Interaction implementation errors
- `ERROR_PR_*`: Permission/business rules errors
- `ERROR_DD_*`: Data design errors
- `ERROR_CA_*`: Computation analysis errors

### Step 4: Analyze and Fix the Error

**For ERROR_ER_001 (Foreign Key Properties)**:
- **Problem**: Entity has ID property referencing another entity (e.g., userId, orderId, parentId, etc.)
- **Solution**:
  1. Remove the ID property from entity
  2. Create a new Relation to link the entities
  3. Update any Transform computations that reference the ID
  4. Update queries to use the relation instead of ID matching
  5. Update exports to include the new relation
  
**For ERROR_CI_011 (Hardcoded Names)**:
- **Problem**: Tests use hardcoded entity/relation names as strings
- **Solution**:
  1. Import entity/relation instances at top of test file
  2. Replace all hardcoded strings with `.name` property
  3. Example: `storage.find('MyEntity', ...)` → `storage.find(MyEntity.name, ...)`

**For ERROR_ER_002 (Both defaultValue and computation)**:
- **Problem**: Property has both `defaultValue` and `computation`
- **Solution**: Remove `defaultValue`, keep only `computation`

**For Missing Computations**:
- **Problem**: Computation identified in analysis/requirements but not implemented
- **Solution**:
  1. Create the computation following patterns in framework documentation
  2. Add tests to verify the computation works
  3. Update implementation plan if exists
  4. Ensure proper data dependencies and triggers are configured

**General Fix Process**:
1. Read the error details carefully
2. Locate the file and line number mentioned
3. Read surrounding code for context
4. Apply the fix following framework best practices
5. Check if related code needs updates (tests, imports, exports)

### Step 5: Validate the Fix
**Action**: Run tests to ensure all module tests pass

**Commands**:
```bash
npm run test
# or your project's test command
```

**Success Criteria**:
- All tests for the module pass (no failures, no skips)
- No new errors introduced
- Type check passes (if applicable)

**If Tests Fail**:
- Analyze the error message
- Review the fix
- Make corrections
- Re-run tests
- Maximum 3 attempts before requesting human help

### Step 6: Update Error Report
**Action**: Mark the fixed error as resolved in error report file (typically `docs/{module}.error-check-report.md`)

**Changes to Make**:
1. Change `[x]` to `[ ]` for the fixed error
2. Update the "Errors Found" count
3. Add a note about the fix if appropriate
4. DO NOT remove the error description (keep for reference)

**Example**:
```diff
- [x] ERROR_ER_001: **CRITICAL**: Entity contains reference ID properties
+ [ ] ERROR_ER_001: **CRITICAL**: Entity contains reference ID properties ✅ FIXED

- **Errors Found**: 1 CRITICAL 🔴
+ **Errors Found**: 0
```

### Step 7: Report and Exit
**Action**: Provide clear summary and wait for user confirmation

**Report Format**:
```
✅ Bug Fix Complete

**Module**: {module}
**Error Fixed**: {ERROR_CODE} - {Short Description}
**Files Modified**:
- {file1}
- {file2}

**Changes Made**:
1. {change description}
2. {change description}

**Test Results**: All tests passing ✓

**Next Steps**:
1. Review the changes
2. Run tests yourself to verify
3. Commit if satisfied: `git add . && git commit -m "fix: {description}"`
4. Run this agent again to fix the next error

⚠️ IMPORTANT: Changes NOT committed automatically. Please review and commit manually.
```

## Important Rules

### DO:
✅ Fix only ONE error per run
✅ Always run tests after fixing
✅ Update error report after successful fix
✅ Follow framework patterns from api-reference.md
✅ Use `.name` property for entity/relation references
✅ Create Relations instead of storing IDs
✅ Wait for user confirmation before proceeding to next error

### DON'T:
❌ Fix multiple errors in one run
❌ Skip running tests after fix
❌ Commit changes (let user do it)
❌ Hardcode entity/relation names
❌ Add ID properties to entities
❌ Modify files not related to the error
❌ Proceed to next error without user instruction

## Edge Cases

### No Errors to Fix
If error report shows all errors as `[ ]`:
```
✅ No errors to fix in {module} module

All identified errors have been resolved. The module is ready for the next phase.
```

### Test Failures After Fix
If tests fail after fixing:
1. Analyze test output
2. Check if fix introduced new issues
3. Review related code
4. Attempt correction (max 3 times)
5. If still failing, report to user and request guidance

### Missing Files
If error report or module file doesn't exist:
```
❌ Cannot proceed - missing files

Missing: {filename}

Please ensure:
1. Module has been properly initialized
2. Error check report has been generated  
3. .currentmodule file exists and contains the module name
4. Project structure matches the expected layout (see "Project Structure Assumptions")
```

## Example Execution

**Scenario**: Fix a critical entity/relation error

**Steps**:
1. ✅ Read api-reference.md (understand framework patterns)
2. ✅ Read .currentmodule → identify which module to work on
3. ✅ Read docs/{module}.error-check-report.md → Find first [x] marked error
4. ✅ Analyze: Review error details, locate file and line number
5. ✅ Fix:
   - Apply appropriate solution based on error type
   - Follow framework best practices
   - Update related code (imports, exports, computations)
6. ✅ Run: `npm run test` → Verify all module tests pass
7. ✅ Update error report: Change `[x]` to `[ ]` for fixed error
8. ✅ Report completion and exit

## Success Metrics

A successful run should:
- Fix exactly 1 error
- All module tests passing
- Error report updated accurately
- Clear report provided to user
- No git commits made
- Ready for user review

---

**Remember**: Quality over speed. One correct fix is better than multiple hasty fixes.

