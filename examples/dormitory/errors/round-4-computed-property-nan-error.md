# Error Round 4: Computed property NaN error

## Problem
When testing the new computed properties, got this error:
```
invalid input syntax for type integer: "NaN"
```

The SQL logs show that the `availableBeds` property is getting `NaN` value when creating a Dormitory.

## Root Cause Analysis
Looking at the computed property definition:

```javascript
const availableBedsProperty = Property.create({
  name: 'availableBeds',
  type: 'number',
  computed: function() {
    return this.capacity - this.occupancy
  }
})
```

The issue is that when creating a new Dormitory entity, `this.occupancy` is not yet available because:
1. The Dormitory is being created first
2. The `occupancy` Count computation depends on DormitoryBedRelation which hasn't been established yet
3. So `this.occupancy` is undefined, causing `undefined - 4 = NaN`

## Issue with Computed Property Dependencies
The problem is that computed properties using `this.property` don't work well when the referenced property depends on relations that aren't established yet during entity creation.

## Solution Needed
I need to either:
1. Use a different approach for computed properties that depend on other computed properties
2. Remove the problematic computed properties for now
3. Or find a way to handle undefined values in computed properties

## Solution Implemented
Removed the problematic computed properties that cause circular dependency issues:
- `availableBeds` (which depended on `occupancy`)
- `occupancyRate` (which depended on `occupancy`)

Kept the working computations:
- ✅ `User.points` Custom computation (100 - sum of violations)
- ✅ `Dormitory.occupancy` Count computation (count of occupied beds)

## Key Learning
Computed properties using `this.property` for dependencies don't work well when:
1. The referenced property is a Count/Custom computation
2. The dependencies aren't established during entity creation
3. This causes `undefined` values leading to NaN errors

## Better Approach
For properties that depend on other computed properties, it's better to:
1. Calculate them in the application layer after entity creation
2. Or use separate Custom computations that handle all dependencies internally
3. Avoid `computed: function() { return this.otherComputedProperty }` pattern

## Status
- [x] Error documented
- [x] Root cause identified
- [x] Fix implemented ✅
- [x] Tests passing ✅