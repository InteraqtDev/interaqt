# Round 1: Relation Name Mismatch Error

## Problem
Test failed when trying to query `DormitoryDormHeadRelation`:
```
Error: cannot find entity DormitoryDormHeadRelation
```

## Analysis
From the SQL logs, I can see that the system auto-generated the relation name as:
`Dormitory_dormHead_managedDormitory_User`

This follows the pattern: `{SourceEntity}_{sourceProperty}_{targetProperty}_{TargetEntity}`

## Root Cause
According to the API reference, when no `name` property is specified in `Relation.create()`, the framework automatically generates the relation name based on source and target entities and properties.

## Solution
In the test, I should use `system.storage.getRelationName()` to get the correct relation name, or query using the auto-generated name pattern.

## Fix Applied
Updated the test to use the auto-generated relation name pattern.