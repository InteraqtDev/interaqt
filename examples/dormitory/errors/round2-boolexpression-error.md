# Round 2 Error: BoolExpression Instance Error

## Error Summary
All tests are now failing with: "match data is not a BoolExpression instance, you passed: [object Object]"

## Error Details
The error occurs when calling `system.storage.find('Dormitory', {})`. The find method expects a BoolExpression/MatchExp but we're passing an empty object.

## Root Cause Analysis
In the test code, we're using:
```typescript
const dormitories = await system.storage.find('Dormitory', {})
```

But the find method expects a MatchExp or undefined for the match parameter, not an empty object.

## Solution
Replace all occurrences of:
- `find('EntityName', {})` with `find('EntityName', undefined)` or just `find('EntityName')`

This will properly query all records without a filter condition.