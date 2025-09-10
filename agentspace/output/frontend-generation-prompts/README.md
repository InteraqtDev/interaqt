# Frontend Generation Agent Prompts Collection

This directory contains a comprehensive set of agent prompts for generating frontend applications for InterAQT-based backend systems.

## Overview

The collection follows a systematic, incremental approach to frontend development using the Axii reactive framework. Each phase builds upon the previous one, ensuring verifiable deliverables at every step.

## Phase Structure

### [00-overview.md](00-overview.md)
- Introduction to the methodology
- InterAQT backend context
- Axii framework overview
- Key principles and success criteria

### [Phase 1: Frontend Requirements Analysis](01-frontend-requirements-analysis.md)
**Purpose**: Analyze backend artifacts and extract frontend requirements

**Key Activities**:
- Analyze entities, relations, interactions, and computations
- Extract user stories from interactions
- Design page structure and navigation
- Specify features and UI patterns

**Deliverable**: `docs/frontend-requirements.json`

### [Phase 2: UI/UX Design and Component Architecture](02-ui-ux-design-architecture.md)
**Purpose**: Create design system and component architecture

**Key Activities**:
- Define visual design tokens
- Create component hierarchy (atomic → molecular → organism → template)
- Map entities to UI components
- Design user flows and interaction patterns

**Deliverable**: `docs/frontend-design-system.json`

### [Phase 3: Data Layer and State Management](03-data-layer-state-management.md)
**Purpose**: Implement reactive state management integrated with backend

**Key Activities**:
- Create frontend models from backend entities
- Design reactive store architecture
- Implement API client with type safety
- Set up real-time synchronization

**Deliverables**: 
- `frontend/src/data/models/`
- `frontend/src/data/stores/`
- `frontend/src/data/api/`

### [Phase 4: Component Implementation (TDD)](04-component-implementation-tdd.md)
**Purpose**: Build UI components using test-driven development

**Key Activities**:
- Set up testing infrastructure
- Implement atomic components with tests first
- Build molecular and organism components
- Create entity-specific components

**Deliverables**:
- `frontend/src/components/`
- `docs/component-catalog.json`
- 98%+ test coverage

### [Phase 5: Integration and Testing](05-integration-testing.md)
**Purpose**: Connect everything and ensure production readiness

**Key Activities**:
- Wire up API integration
- Implement complete pages
- Write end-to-end tests
- Optimize performance
- Prepare for production

**Deliverables**:
- Complete frontend application
- `docs/frontend-integration-report.json`
- E2E test suite

## Usage Instructions

1. **For Project Managers**: Use the overview to understand the complete process and timeline
2. **For Individual Agents**: Each phase document serves as a complete prompt for that phase's agent
3. **For Quality Assurance**: Each phase includes validation checklists and deliverable specifications

## Key Features

- **Incremental Development**: Each phase produces concrete, testable deliverables
- **Test-Driven**: Tests are written before implementation
- **Type-Safe**: Full TypeScript support throughout
- **Reactive**: Leverages both InterAQT and Axii's reactive capabilities
- **Production-Ready**: Includes performance optimization and error handling

## Success Metrics

- Complete type safety between frontend and backend
- All backend interactions accessible through UI
- Real-time reactive updates without manual refresh
- 95%+ test coverage across unit, integration, and E2E tests
- Performance metrics meeting modern web standards
- Beautiful, accessible UI following best practices

## Dependencies

- **Backend**: InterAQT framework with entities, relations, interactions, and computations
- **Frontend**: Axii reactive framework
- **Testing**: Vitest for unit tests, Playwright for E2E tests
- **Build**: Vite for development and production builds

## Notes

- Each agent should complete their phase fully before the next phase begins
- Deliverables from each phase serve as inputs for subsequent phases
- The approach emphasizes quality over speed, with comprehensive testing at each step
- The methodology can be adapted for different project sizes by scaling the complexity of deliverables
