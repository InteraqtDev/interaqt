# Round 1 Error: Integer Out of Range

## Error Summary
All tests are failing with "integer out of range" error when trying to insert data into the database.

## Error Details
From the test output, we can see:
- The error occurs at the PostgreSQL protocol level when parsing data
- Looking at the table creation SQL, the timestamp values have very large defaults like `1753492492119`
- These values appear to be coming from Date.now() calls but might be getting incorrectly interpreted

## Root Cause Analysis
The issue appears to be that Date.now() returns a timestamp in milliseconds since Unix epoch, which is a very large number. When this is used as a default value in SQL, it might exceed the INTEGER range in PostgreSQL.

Looking at the SQL logs:
```sql
"use_cur_62" INT DEFAULT 1753492492119,
"bed_rec_32" INT DEFAULT 1753492492119,
```

The value `1753492492119` is too large for a PostgreSQL INTEGER type, which has a range of -2147483648 to 2147483647.

## Solution
The timestamp fields should be using BIGINT type instead of INT, or we should not be setting default values this way. The issue might be in how the interaqt framework is handling timestamp property types.

## Fix Approach
1. Check property definitions that use timestamp values
2. Ensure they're using the correct type (should be 'number' with appropriate handling)
3. Remove any defaultValue functions that might be causing issues with timestamps
4. Let the framework handle timestamp defaults properly