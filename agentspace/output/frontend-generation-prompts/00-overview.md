# Frontend Generation Agent Prompts Overview

## Purpose

This collection of agent prompts guides the systematic generation of frontend applications for InterAQT-based backend systems. The approach follows a reactive, incremental methodology that aligns with InterAQT's data-reactive philosophy.

## InterAQT Backend Context

InterAQT is a data-reactive backend framework with the following core concepts:

### Core Concepts Produced by Backend
1. **Entities**: Business objects with properties (e.g., User, Post, Comment)
2. **Relations**: Connections between entities (e.g., UserPostRelation with cardinality)
3. **Interactions**: User-triggered actions that modify system state (e.g., CreatePost, UpdatePost)
4. **Computations**: Reactive components including:
   - Transform: Creates new entities/relations
   - StateMachine: Manages property state changes
   - Count/Summation: Aggregates based on relations
   - Activity: Handles asynchronous operations

### Backend Deliverables (Input for Frontend)
From the backend generation process, we have:
- `backend/entities.ts`: Entity definitions with properties
- `backend/relations.ts`: Relationship definitions between entities
- `backend/interactions.ts`: Available user actions with payloads
- `backend/computations.ts`: Reactive logic definitions
- `docs/data-design.json`: Complete data model documentation
- `docs/interaction-design.json`: Interaction specifications

## Frontend Framework: Axii

Axii is a reactive frontend framework that aligns well with InterAQT's philosophy:
- Component-based architecture
- Reactive data binding
- Built-in state management
- TypeScript-first approach

## Generation Phases

### Phase 1: Frontend Requirements Analysis
- Analyze backend artifacts to understand data model
- Extract user stories from interactions
- Define page structure and navigation flow
- Create frontend-specific requirements document

### Phase 2: UI/UX Design and Component Architecture
- Design component hierarchy based on entities
- Map interactions to UI actions
- Define routing and navigation patterns
- Create style guide and design system specs

### Phase 3: Data Layer and State Management
- Design reactive data store architecture
- Create entity-to-model mappings
- Define API integration patterns
- Implement reactive data flow

### Phase 4: Component Implementation (TDD)
- Implement atomic components with tests
- Build composite components incrementally
- Create page layouts
- Implement interaction handlers

### Phase 5: Integration and Testing
- Connect frontend to backend APIs
- Implement end-to-end user flows
- Performance optimization
- Final validation and polish

## Key Principles

1. **From Whole to Parts**: Start with overall user goals, then detail specific implementations
2. **Incremental Development**: Each step produces verifiable deliverables
3. **Test-Driven**: Write tests before implementation
4. **Reactive Alignment**: Frontend reactivity mirrors backend reactivity
5. **Type Safety**: Leverage TypeScript throughout

## Document Templates

Each phase has specific document templates to ensure consistent, verifiable deliverables:
- Requirements specifications
- Design documents
- Test plans
- Implementation guides
- Integration checklists

## Success Criteria

- Complete type safety between frontend and backend
- All interactions accessible through UI
- Reactive data updates without manual refreshes
- Comprehensive test coverage
- Beautiful, modern UI following best UX practices
