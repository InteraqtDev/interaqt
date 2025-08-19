# Test Case Generation Improvements

## Summary of Changes to CLAUDE.md

### Latest Update: Simplified and Streamlined for Agent Readability

**Document Improvements:**
- **Removed Visual Elements**: No ASCII diagrams or decorative formatting
- **Simplified Structure**: Direct, actionable instructions without checkboxes
- **Clearer Flow**: Computation selection integrated into loop with conditional branching
- **Concise Language**: Removed redundant explanations and focused on essential steps

**New Flow Structure in Task 3.1.4.3:**
- **START**: Read plan, select first uncompleted computation
- **Branch**: Check for `lastError` field
  - If exists → Deep Debug Mode (review, analyze, fix, test)
  - If not → Normal Flow (implement, type check, plan test, write test, run test)
- **Document**: Update completion status
- **Loop**: Return to START for next computation

**Benefits:**
1. **Faster Processing**: Agent can quickly understand and execute steps
2. **Clear Decision Points**: Simple if/then logic for path selection
3. **Error Context Preserved**: lastError field maintains debugging history
4. **Progressive Implementation**: Dependencies respected through ordered execution

### 1. Added Test Case Planning Step (Step 3)
**Purpose**: Ensure agents analyze dependencies before writing test code

**Key Features**:
- Mandatory test plan comment with structured format
- Requires listing all `expandedDependencies` from computation-implementation-plan.json
- Forces thinking about setup, execution, verification, and side effects
- Cross-references with business requirements

**Benefits**:
- Prevents missing critical dependencies
- Ensures proper test data setup order
- Documents test intent for future reference
- Reduces test failures due to incorrect setup

### 2. Enhanced Business Logic Validation (Step 5)
**Purpose**: Help agents diagnose and fix business logic failures

**Key Features**:
- Systematic checklist for debugging business logic failures
- References to key documentation (interaction-matrix, data-design, computation-analysis)
- Common issues checklist
- Requires documenting errors with context
- **Error Tracking in computation-implementation-plan.json**: Adds `lastError` field with error document path for failed computations

**Benefits**:
- Faster problem resolution
- Better understanding of root causes
- Improved documentation of issues
- Learning from past mistakes
- Easy tracking of which computations have unresolved errors

### 3. Added Best Practices Section
**Purpose**: Provide guidance for writing better test cases

**Key Features**:
- Context understanding emphasis
- Realistic test data guidelines
- Test isolation principles
- Common pattern examples
- Pitfall avoidance tips

**Benefits**:
- Higher quality test cases
- More maintainable tests
- Better coverage of edge cases
- Fewer common mistakes

## Deep Debug Mode Quick Reference

**Common Error Patterns:**

1. **Missing Dependencies**: Check `expandedDependencies`, ensure correct creation order
2. **Wrong Test Expectations**: Verify against `requirements/interaction-matrix.md`
3. **Computation Not Triggered**: Confirm interaction modifies required entities/relations
4. **Timing Issues**: Check async operations and await usage

**Debug Priority Order:**
1. Type error → Fix syntax
2. Test data issue → Fix setup order
3. Business logic mismatch → Adjust expectations
4. Dependency issue → Check expandedDependencies
5. Framework issue → Review API usage

## Additional Recommendations for Better Test Generation

### 1. Implement Test Templates
Create reusable test templates for common computation types:

```typescript
// templates/test-templates.ts
export const countComputationTestTemplate = (entityName: string, propertyName: string, relationName: string) => `
test('${entityName}.${propertyName} count computation', async () => {
  /**
   * Test Plan for: ${entityName}.${propertyName} Count
   * Dependencies: ${relationName}
   * ...
   */
  
  // 1. Create source entity
  // 2. Create 0 related items - verify count is 0
  // 3. Create 3 related items - verify count is 3
  // 4. Delete 1 item - verify count is 2
  // 5. Delete all items - verify count is 0
})
`
```

### 2. Dependency Visualization
Consider adding a dependency graph visualization tool that shows:
- Which entities/relations need to exist before testing
- The order of creation required
- Circular dependencies that might cause issues

### 3. Test Data Factory Pattern
Implement test data factories to ensure consistent, valid test data:

```typescript
// tests/factories/index.ts
export const createTestUser = (overrides = {}) => ({
  name: faker.name.fullName(),
  email: faker.internet.email(),
  role: 'student',
  status: 'active',
  ...overrides
})

export const createTestDormitory = (overrides = {}) => ({
  name: `Dormitory ${faker.datatype.number({ min: 1, max: 999 })}`,
  capacity: faker.datatype.number({ min: 4, max: 6 }),
  floor: faker.datatype.number({ min: 1, max: 10 }),
  ...overrides
})
```

### 4. Automated Test Case Generation
For simple computations, consider generating basic test cases automatically:

```typescript
// scripts/generate-basic-tests.ts
function generateDefaultValueTest(entity: Entity, property: Property) {
  if (property.computation?.type === 'DefaultValue') {
    return `
test('${entity.name}.${property.name} has correct default value', async () => {
  const item = await system.storage.create('${entity.name}', {
    // Required fields only
  })
  
  const found = await system.storage.findOne(
    '${entity.name}',
    MatchExp.atom({ key: 'id', value: ['=', item.id] }),
    undefined,
    ['id', '${property.name}']
  )
  
  expect(found.${property.name}).toBe(${JSON.stringify(property.defaultValue)})
})
`
  }
}
```

### 5. Test Coverage Tracking
Add a coverage report for computations:

```typescript
// scripts/check-computation-coverage.ts
function checkComputationTestCoverage() {
  const plan = JSON.parse(fs.readFileSync('docs/computation-implementation-plan.json'))
  const tests = fs.readFileSync('tests/basic.test.ts', 'utf-8')
  
  const untested = []
  for (const phase of plan.phases) {
    for (const computation of phase.computations) {
      const testPattern = new RegExp(`test\\(['"]\.*${computation.id}.*['"]`)
      if (!testPattern.test(tests)) {
        untested.push(computation.id)
      }
    }
  }
  
  if (untested.length > 0) {
    console.warn('Computations without tests:', untested)
  }
}
```

### 6. Error Pattern Library
Create a library of common error patterns and their solutions:

```markdown
# docs/common-test-errors.md

## Error: Cannot read property 'X' of undefined
**Cause**: Missing attributeQuery in storage.find/findOne
**Solution**: Add the property to attributeQuery array

## Error: Computation not triggered
**Cause**: Using storage.create instead of Interaction
**Solution**: Use controller.callInteraction to trigger computations

## Error: State machine not transitioning
**Cause**: Missing required conditions or wrong interaction
**Solution**: Check StateMachine definition and use correct interaction
```

### 7. Integration with CI/CD
Add pre-commit hooks to:
- Verify all computations have tests
- Check test plan comments exist
- Validate expandedDependencies coverage
- Run affected tests when computations change

### 8. Test Debugging Helpers
Add utility functions for debugging:

```typescript
// tests/helpers/debug.ts
export async function dumpEntityState(entityName: string, id: string) {
  const entity = await system.storage.findOne(
    entityName,
    MatchExp.atom({ key: 'id', value: ['=', id] }),
    undefined,
    ['*'] // In debug mode, get all fields
  )
  console.log(`${entityName} state:`, JSON.stringify(entity, null, 2))
  return entity
}

export async function traceComputation(computation: string) {
  console.log(`Tracing computation: ${computation}`)
  // Log all related entity changes
  // Show computation trigger points
  // Display final computed values
}
```

### 9. Error Status Dashboard
Create a script to show the current status of all computations with errors:

```typescript
// scripts/show-error-status.ts
function showErrorStatus() {
  const plan = JSON.parse(fs.readFileSync('docs/computation-implementation-plan.json'))
  
  console.log('Computation Error Status:')
  console.log('========================')
  
  let hasErrors = false
  for (const phase of plan.phases) {
    for (const computation of phase.computations) {
      if (computation.lastError) {
        hasErrors = true
        console.log(`❌ ${computation.id}`)
        console.log(`   Error: ${computation.lastError}`)
        console.log(`   Phase: ${phase.phase}`)
        if (fs.existsSync(computation.lastError)) {
          const errorContent = fs.readFileSync(computation.lastError, 'utf-8')
          const firstLine = errorContent.split('\n')[0]
          console.log(`   Summary: ${firstLine}`)
        }
      }
    }
  }
  
  if (!hasErrors) {
    console.log('✅ No computations with errors!')
  }
  
  // Show completion progress
  const total = plan.phases.reduce((sum, p) => sum + p.computations.length, 0)
  const completed = plan.phases.reduce((sum, p) => 
    sum + p.computations.filter(c => c.completed).length, 0
  )
  console.log(`\nProgress: ${completed}/${total} computations completed`)
}
```

## Conclusion

These improvements focus on three key areas:
1. **Prevention**: Better planning prevents incorrect test implementation
2. **Diagnosis**: Clear debugging steps when tests fail
3. **Quality**: Best practices and patterns for maintainable tests

The combination of structured planning, systematic debugging, and reusable patterns will significantly improve the agent's ability to generate correct, comprehensive test cases for computations with complex dependencies.
