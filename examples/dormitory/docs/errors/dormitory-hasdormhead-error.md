# Dormitory.hasDormHead Computation Error

## Problem
The Dormitory.hasDormHead computation was originally planned as an "Any" computation in the implementation plan, but Any computations only work with x:n relations (1:n or n:n). The DormitoryDormHeadRelation is n:1, so Any cannot be used.

## Attempts
1. **Any computation**: Failed - n:1 relation not supported
2. **Custom computation with dataDeps**: Failed - dormHead property not accessible through dataDeps
3. **Custom computation with direct query**: Failed - computation not triggered properly  
4. **Simple computed property**: Failed - `this.dormHead` not accessible in computed function

## Root Cause
The computed property approach doesn't work because when using `.computed`, the `this` context doesn't have the populated relation data. The relation data (dormHead) is loaded separately and not available in the simple computed property context.

## Solution
Since the relation is n:1 and we need to check if it exists, we should use a different approach that properly accesses the relation data. The best approach is to NOT use a computation at all for this case, but rather check the dormHead property directly in application code when needed.

Alternatively, if a computation is required, it should be implemented as a getValue computation that checks if the dormHead property is populated after the entity is loaded with the relation.
