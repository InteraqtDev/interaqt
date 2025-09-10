# Claude Code Agent + Sub Agents for Frontend Generation

This directory contains a complete set of Claude code agent prompts for generating frontend applications for interaqt-based backend systems, organized in the Claude agent + sub-agents format with STATUS.json flow control.

## Structure

### Main Agent
- **FRONTEND_AGENT.md** - The main orchestrator agent that manages the entire frontend generation process

### Sub-Agents (in agents/ directory)
1. **frontend-requirements-analysis.md** - Phase 1 sub-agent for analyzing backend artifacts and extracting frontend requirements
2. **frontend-ui-ux-design.md** - Phase 2 sub-agent for designing UI/UX architecture and component hierarchy
3. **frontend-data-layer.md** - Phase 3 sub-agent for implementing reactive data layer and state management
4. **frontend-component-implementation.md** - Phase 4 sub-agent for TDD-based component implementation
5. **frontend-integration-testing.md** - Phase 5 sub-agent for API integration and end-to-end testing

### Control Files
- **SCHEDULE.json** - Controls autorun behavior and phase progression
- **frontend/docs/STATUS.json** - Tracks current progress and phase completion (created during execution)

## How It Works

1. **Progress Tracking**: The system uses `frontend/docs/STATUS.json` to track which phase is currently active and what has been completed.

2. **Phase Execution**: Based on the current phase in STATUS.json, the main agent delegates to the appropriate sub-agent.

3. **Autorun Control**: The SCHEDULE.json file controls whether phases automatically progress or require manual intervention.

4. **Incremental Development**: Within each phase, work is broken down into incremental tasks that can be verified independently.

## Usage

1. Start with the main FRONTEND_AGENT.md prompt
2. The agent will check for STATUS.json and create it if needed
3. Based on the current phase, it will invoke the appropriate sub-agent
4. Each sub-agent contains detailed step-by-step instructions
5. Progress is tracked in STATUS.json throughout execution
6. When autorun is enabled, phases will progress automatically

## Key Features

- **STATUS.json Flow Control**: Similar to the backend generation guide, uses STATUS.json to track exact position in the workflow
- **Incremental Approach**: Each phase produces verifiable deliverables
- **Test-Driven Development**: Phase 4 enforces writing tests before implementation
- **Type Safety**: Maintains full TypeScript type safety with backend
- **Comprehensive Coverage**: From requirements analysis to production-ready deployment

## Phase Overview

1. **Phase 1 - Requirements Analysis**
   - Analyzes backend entities, relations, interactions, and computations
   - Extracts user stories and creates information architecture
   - Deliverable: `frontend/docs/frontend-requirements.json`

2. **Phase 2 - UI/UX Design**
   - Creates design tokens and component architecture
   - Designs layout templates and interaction patterns
   - Deliverable: `frontend/docs/frontend-design-system.json`

3. **Phase 3 - Data Layer**
   - Sets up project with TypeScript and Vite
   - Implements reactive models and stores
   - Creates API client with full type safety
   - Deliverable: Complete data layer implementation

4. **Phase 4 - Component Implementation**
   - Implements all UI components using TDD
   - Follows atomic design principles
   - Achieves 95%+ test coverage
   - Deliverable: Full component library

5. **Phase 5 - Integration & Testing**
   - Connects frontend to backend APIs
   - Implements E2E tests with Playwright
   - Optimizes performance
   - Deliverable: Production-ready application

## Configuration

### Enabling Autorun
To enable automatic progression between phases:
```json
{
  "autorun": true
}
```

### Manual Control
With autorun disabled (default), the agent will stop after each phase and wait for user instruction to continue.

## Quality Gates

Each phase has strict completion criteria:
- All deliverables must be created
- Test coverage must meet minimum requirements
- No TypeScript or linting errors
- Manual verification of functionality

## Integration with Axii

The prompts are specifically designed for the Axii reactive framework:
- Uses Axii's atom/computed pattern for state management
- Leverages reactive collections (RxList, RxMap, RxSet)
- Implements components with RenderContext
- Includes comprehensive Axii API reference

## Notes

- All work happens in the `frontend/` directory
- Backend files are read-only references
- Each phase builds upon previous work
- The methodology emphasizes quality over speed
