# Permission Control (Deprecated)

The `userAttributives` and `dataAttributives` permission control features have been removed from the interaqt framework.

For controlling access to interactions and data, please use:
- `conditions` parameter in Interaction.create() for execution conditions
- Application-level authentication and authorization (e.g., JWT, OAuth)
- Custom business logic in your interactions

The framework now focuses on reactive business logic rather than built-in permission control.