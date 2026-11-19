# Update snapshots and dependency invalidation

The first implementation of `Property.excludeFromOldRecord` checked SQL projections and update events on a Controller backed by PGLite. Five gaps remained in that test design.

| Observable failure | Why the original coverage missed it | Regression coverage |
| --- | --- | --- |
| Clearing an excluded string persisted an empty database value while its derived length retained the previous value. | The dependency tests changed one defined string to another. They never compared a missing old value with an explicitly written `undefined`. | Check the persisted value and three independently derived results for explicit, wildcard and relation-path subscriptions. Use an ordinary same-value write as a control. |
| A standalone storage update to a title replaced an excluded body with its default. | Every rejection test initialized a Controller. Direct users of `DBSetup` reached the same write executor without registering a Scheduler. | Construct the schema using the documented storage API. Reject conflicting declarations before use and verify a legal direct update preserves its stored value. |
| An unrelated third-party computation failed at startup when it used an object-valued `transfers` argument. | The listener tests only supplied StateMachine transfers and built-in computations. | Register a third-party computation with its own argument shape, both with and without excluded columns in the model. |
| A sequence on a filtered view could use an excluded scope field from its base. Two rows could then carry the same number in one scope. | The validation test declared the sequence and exclusion on the same entity. The immutability test did not cross the view's event namespace. | Check the physical scope column at setup. Exercise membership, exit in the same write, reference scopes and unrelated nonmembers through real mutations. |
| A synthetic computation update contained an excluded field in its old snapshot. | The event assertions observed storage writes. Dictionary changes and an unchanged-value migration takeover can produce host updates without writing the host. | Inspect the old snapshot and the current host independently in both callback paths. |

The old snapshot describes the prior values available to an observer. The written keys identify which properties to invalidate when those prior values are unavailable. Storage schema compilation enforces the rules needed by the physical write path, and listener setup checks the additional dependencies introduced by computations.
