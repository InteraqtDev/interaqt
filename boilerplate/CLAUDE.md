# Claude Working Guide for interaqt Framework

## Overview

This document provides comprehensive guidelines for Claude when working with the interaqt framework. Follow these instructions strictly to ensure high-quality, consistent outputs that align with the framework's principles and best practices.

## I. Pre-Execution Knowledge Loading (MANDATORY)

### 🔴 CRITICAL RULE: Knowledge Base Loading

**Before executing ANY task related to interaqt**, you MUST read and internalize the complete knowledge base located in `agentspace/knowledge/` as your foundation prompt. This is not optional.

### Required Reading Order

1. **Core Philosophy** (MUST READ FIRST):
   ```
   agentspace/knowledge/usage/00-mindset-shift.md
   ```
   - Understand the fundamental shift from "manipulating data" to "declaring data essence"
   - Internalize the reactive programming paradigm

2. **Framework Concepts** (READ SEQUENTIALLY):
   ```
   agentspace/knowledge/usage/01-core-concepts.md
   agentspace/knowledge/usage/02-define-entities-properties.md
   agentspace/knowledge/usage/03-entity-relations.md
   agentspace/knowledge/usage/04-reactive-computations.md
   agentspace/knowledge/usage/05-interactions.md
   agentspace/knowledge/usage/06-attributive-permissions.md
   agentspace/knowledge/usage/07-activities.md
   agentspace/knowledge/usage/08-filtered-entities.md
   agentspace/knowledge/usage/09-async-computations.md
   agentspace/knowledge/usage/10-global-dictionaries.md
   agentspace/knowledge/usage/11-data-querying.md
   agentspace/knowledge/usage/12-testing.md
   agentspace/knowledge/usage/13-api-reference.md
   agentspace/knowledge/usage/14-entity-crud-patterns.md
   agentspace/knowledge/usage/15-frontend-page-design-guide.md
   agentspace/knowledge/usage/16-performance-optimization.md
   ```

3. **Development Guidelines**:
   ```
   agentspace/knowledge/development/01-architecture-design.md
   agentspace/knowledge/development/02-core-implementation.md
   agentspace/knowledge/development/03-extension-development.md
   agentspace/knowledge/development/04-testing.md
   agentspace/knowledge/development/05-realtime-implementation.md
   ```

### ⚠️ Knowledge Loading Validation

After reading the knowledge base, you MUST demonstrate understanding by:
1. Acknowledging the reactive programming paradigm
2. Confirming understanding of Entity, Relation, Interaction, and Computation concepts
3. Showing awareness of the test-driven development approach

## II. Project Generation Protocol

### When User Requests Project Generation

If a user requests to generate an interaqt application based on requirements, you MUST strictly follow the **Test-Case Driven Development** workflow outlined in:

```
agentspace/llm_generator_guide_en.md
```

### Mandatory Steps (DO NOT SKIP ANY)

#### Phase 1: Requirements Analysis
1. **Read the LLM Generator Guide**:
   - Load `agentspace/llm_generator_guide_en.md` completely
   - Understand the test-case driven approach
   - Internalize the frontend-backend alignment principles

2. **Deep Requirements Analysis**:
   - Analyze user requirements from data perspective (entities, properties, relationships)
   - Analyze from interaction perspective (user operations, permissions, processes)
   - Create detailed requirements documentation

3. **Test Case Design** (CRITICAL):
   - Create comprehensive `requirements/test-cases.md`
   - Write CRUD test cases for every entity
   - Write test scenarios for every interaction
   - Write validation cases for every computed property
   - Write end-to-end business process cases

#### Phase 2: Backend Implementation
1. **Framework Learning Validation**:
   - Confirm understanding of reactive computations
   - Validate Entity/Relation modeling approach
   - Ensure proper Interaction design patterns

2. **Code Generation Order**:
   - Entities and Properties first
   - Relations second
   - Computations third
   - Interactions and Activities last
   - Tests for each module immediately after implementation

3. **Quality Assurance**:
   - Ensure 100% test coverage
   - Validate all reactive computations
   - Verify permission controls
   - No fictional/non-existent features

#### Phase 3: Frontend Implementation
1. **Backend-Frontend Alignment**:
   - Frontend features MUST derive completely from backend test cases
   - Create `frontend/requirements/backend-frontend-mapping.md`
   - Ensure no fictional frontend features

2. **UI Test Case Design**:
   - Every backend test case must have corresponding UI test case
   - No frontend functionality without backend support
   - Perfect one-to-one mapping

3. **Implementation Validation**:
   - Every backend Interaction has UI entry point
   - No missing backend features in frontend
   - Complete error handling and loading states

## III. Working Standards

### Communication Protocol

1. **Before Starting Any Task**:
   ```
   I am loading the interaqt knowledge base from agentspace/knowledge/...
   [Demonstrate understanding of key concepts]
   Now proceeding with your request using the interaqt framework principles.
   ```

2. **For Project Generation Requests**:
   ```
   I will follow the test-case driven development workflow from llm_generator_guide_en.md:
   1. Loading complete knowledge base
   2. Analyzing requirements and creating test cases
   3. Implementing backend with full test coverage
   4. Creating aligned frontend based on backend test cases
   5. Ensuring perfect frontend-backend mapping
   ```

### Quality Standards

#### Code Quality
- [ ] All code follows interaqt reactive programming paradigm
- [ ] No imperative business logic in Interactions
- [ ] All computations are declarative
- [ ] 100% test coverage achieved
- [ ] No fictional or hallucinated features

#### Documentation Quality
- [ ] All test cases documented in proper format
- [ ] Backend-frontend mapping complete
- [ ] Architecture decisions clearly explained
- [ ] API documentation generated

#### Frontend-Backend Alignment
- [ ] Every backend feature has frontend implementation
- [ ] No frontend features without backend support
- [ ] Permission logic consistent across layers
- [ ] Data models perfectly aligned

## IV. Error Prevention Guidelines

### Common Mistakes to Avoid

1. **Framework Misunderstanding**:
   - ❌ Don't treat interaqt like traditional MVC frameworks
   - ❌ Don't write imperative business logic
   - ✅ Embrace reactive, declarative programming

2. **Test Case Negligence**:
   - ❌ Don't start coding without complete test cases
   - ❌ Don't create features without test coverage
   - ✅ Test-driven development is mandatory

3. **Frontend-Backend Disconnection**:
   - ❌ Don't create frontend features independently
   - ❌ Don't miss backend features in frontend
   - ✅ Perfect alignment through test case mapping

4. **Knowledge Base Shortcuts**:
   - ❌ Don't assume knowledge without reading documentation
   - ❌ Don't use experience from other frameworks
   - ✅ Always load complete knowledge base first

## V. Success Criteria

### For Any interaqt Task
- [ ] Knowledge base completely loaded and understood
- [ ] Framework principles correctly applied
- [ ] Reactive programming paradigm followed
- [ ] High-quality, maintainable code produced

### For Project Generation
- [ ] Complete test-case driven workflow followed
- [ ] Backend implementation with 100% test coverage
- [ ] Frontend perfectly aligned with backend
- [ ] All documentation requirements met
- [ ] Integration testing completed successfully

## VI. Emergency Protocols

### If You're Unsure About Framework Concepts
1. **STOP** and re-read relevant knowledge base sections
2. Ask for clarification while demonstrating current understanding
3. Reference specific documentation sections
4. Do not proceed with incorrect assumptions

### If Requirements Are Unclear
1. Analyze requirements using framework perspective
2. Ask specific questions about entities, relations, and interactions
3. Propose test cases for validation
4. Do not make assumptions about business logic

## Conclusion

This guide ensures that Claude consistently delivers high-quality interaqt applications that:
- Follow framework best practices
- Maintain perfect frontend-backend alignment
- Achieve comprehensive test coverage
- Respect the reactive programming paradigm

**Remember: Knowledge base loading is MANDATORY before any interaqt-related task. There are no exceptions to this rule.** 