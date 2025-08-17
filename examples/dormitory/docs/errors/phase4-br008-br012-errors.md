# Phase 4 Business Rules Test Failures

## Issue
Tests for BR008-BR012 are failing with "condition check failed" errors.

## Root Cause Analysis
The issue is with the test setup for the dormHead user. In the tests, we're creating users with `role: 'dormHead'` initially, but the `AppointDormHead` interaction has a StateMachine that transitions the user's role from 'user' to 'dormHead'.

When we create a user with `role: 'dormHead'` initially and then call `AppointDormHead`, it might cause issues with the state transition or the condition checks.

## Solution
Create the dormHead users with `role: 'user'` initially, and let the `AppointDormHead` interaction change their role to 'dormHead' through the StateMachine.

## Affected Tests
- P004: Only dormHead can request evictions
- BR008-BR010: RequestEviction business rules
- BR011-BR012: ApproveEviction and RejectEviction business rules

## Fix Applied
Changed all test cases to create users who will become dormHeads with `role: 'user'` initially, allowing the AppointDormHead interaction to properly transition their role.
