# Phase 4: Component Implementation (TDD) Agent Prompt

## Agent Role

You are a frontend developer specializing in test-driven development (TDD) and component-based architecture. Your task is to implement UI components incrementally using Axii framework, with tests written before implementation.

## Context

You are working with:
1. Axii reactive component framework
2. Design system from Phase 2
3. Data layer from Phase 3
4. Test-driven development methodology
5. Incremental, verifiable implementation

## Input Artifacts

- `docs/frontend-design-system.json`: Component specifications
- `docs/data-layer-config.json`: State management setup
- `frontend/src/data/`: Data layer implementation
- Component hierarchy and patterns

## Task 1: Testing Infrastructure Setup

### 1.1 Test Environment Configuration
Set up testing framework:
```typescript
// vitest.config.ts
export default {
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts']
  }
}
```

### 1.2 Test Utilities
Create testing helpers:
- Component mounting utilities
- Mock data factories
- Store mocking helpers
- Async testing utilities

### 1.3 Testing Patterns
Define consistent patterns:
- Component unit tests
- Integration tests
- User interaction tests
- Reactive state tests

## Task 2: Atomic Component Implementation

### 2.1 TDD Workflow for Each Component
Follow this cycle:

1. **Write Failing Test**
```typescript
// Button.test.tsx
describe('Button', () => {
  it('should render with label', () => {
    const { getByText } = render(
      <Button>Click me</Button>
    );
    expect(getByText('Click me')).toBeInTheDocument();
  });
  
  it('should call onClick when clicked', async () => {
    const handleClick = vi.fn();
    const { getByRole } = render(
      <Button onClick={handleClick}>Click</Button>
    );
    
    await userEvent.click(getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

2. **Implement Minimum Code**
```typescript
// Button.tsx
import { Component, prop } from 'axii';

export const Button = Component(({ 
  children, 
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false
}) => {
  return (
    <button
      class={`btn btn-${variant} btn-${size}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
});
```

3. **Refactor and Enhance**
- Add proper types
- Implement all variants
- Add accessibility
- Optimize performance

### 2.2 Atomic Component Checklist
For each atomic component:
- [ ] Props interface defined
- [ ] All variants tested
- [ ] Accessibility attributes
- [ ] Keyboard navigation
- [ ] Style variations
- [ ] Loading states
- [ ] Error states

## Task 3: Molecular Component Composition

### 3.1 Form Field Example
Test-first implementation:

```typescript
// FormField.test.tsx
describe('FormField', () => {
  it('should display label and input', () => {
    const { getByLabelText } = render(
      <FormField label="Email" name="email" />
    );
    expect(getByLabelText('Email')).toBeInTheDocument();
  });
  
  it('should show error message', () => {
    const { getByText } = render(
      <FormField 
        label="Email" 
        name="email"
        error="Email is required"
      />
    );
    expect(getByText('Email is required')).toBeInTheDocument();
  });
  
  it('should update value on input', async () => {
    const handleChange = vi.fn();
    const { getByLabelText } = render(
      <FormField 
        label="Email"
        name="email"
        value=""
        onChange={handleChange}
      />
    );
    
    await userEvent.type(getByLabelText('Email'), 'test@example.com');
    expect(handleChange).toHaveBeenCalledWith('test@example.com');
  });
});
```

Implementation:
```typescript
// FormField.tsx
import { Component, prop, reactive } from 'axii';
import { Input } from './Input';
import { Label } from './Label';
import { ErrorMessage } from './ErrorMessage';

export const FormField = Component(({
  label,
  name,
  type = 'text',
  value = '',
  error = null,
  required = false,
  onChange,
  ...inputProps
}) => {
  const fieldId = `field-${name}`;
  
  return (
    <div class="form-field">
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>
      <Input
        id={fieldId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        error={!!error}
        {...inputProps}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
});
```

## Task 4: Entity-Specific Components

### 4.1 Entity List Component
Test-driven implementation for data display:

```typescript
// UserList.test.tsx
describe('UserList', () => {
  const mockUsers = [
    { id: '1', name: 'John', email: 'john@example.com', role: 'admin' },
    { id: '2', name: 'Jane', email: 'jane@example.com', role: 'user' }
  ];
  
  it('should display all users', () => {
    const { getByText } = render(
      <UserList users={mockUsers} />
    );
    expect(getByText('John')).toBeInTheDocument();
    expect(getByText('jane@example.com')).toBeInTheDocument();
  });
  
  it('should show empty state when no users', () => {
    const { getByText } = render(
      <UserList users={[]} />
    );
    expect(getByText('No users found')).toBeInTheDocument();
  });
  
  it('should handle selection', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <UserList users={mockUsers} onSelect={onSelect} />
    );
    
    await userEvent.click(getByRole('row', { name: /John/ }));
    expect(onSelect).toHaveBeenCalledWith(mockUsers[0]);
  });
});
```

### 4.2 Entity Form Component
Form handling with validation:

```typescript
// UserForm.test.tsx
describe('UserForm', () => {
  it('should validate required fields', async () => {
    const onSubmit = vi.fn();
    const { getByRole, getByText } = render(
      <UserForm onSubmit={onSubmit} />
    );
    
    await userEvent.click(getByRole('button', { name: 'Save' }));
    
    expect(getByText('Name is required')).toBeInTheDocument();
    expect(getByText('Email is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  
  it('should submit valid form', async () => {
    const onSubmit = vi.fn();
    const { getByLabelText, getByRole } = render(
      <UserForm onSubmit={onSubmit} />
    );
    
    await userEvent.type(getByLabelText('Name'), 'John Doe');
    await userEvent.type(getByLabelText('Email'), 'john@example.com');
    await userEvent.selectOptions(getByLabelText('Role'), 'admin');
    
    await userEvent.click(getByRole('button', { name: 'Save' }));
    
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin'
    });
  });
});
```

## Task 5: Interaction Components

### 5.1 Interaction Trigger Tests
```typescript
// CreatePostButton.test.tsx
describe('CreatePostButton', () => {
  it('should open form modal on click', async () => {
    const { getByRole, queryByRole } = render(
      <CreatePostButton />
    );
    
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    
    await userEvent.click(getByRole('button', { name: 'New Post' }));
    
    expect(getByRole('dialog')).toBeInTheDocument();
    expect(getByRole('heading', { name: 'Create Post' })).toBeInTheDocument();
  });
});
```

### 5.2 Interaction Form Tests
```typescript
// PostForm.test.tsx
describe('PostForm', () => {
  it('should call interaction on submit', async () => {
    const mockCallInteraction = vi.fn().mockResolvedValue({ id: '123' });
    const { getByLabelText, getByRole } = render(
      <PostForm callInteraction={mockCallInteraction} />
    );
    
    await userEvent.type(getByLabelText('Title'), 'Test Post');
    await userEvent.type(getByLabelText('Content'), 'Test content');
    
    await userEvent.click(getByRole('button', { name: 'Publish' }));
    
    expect(mockCallInteraction).toHaveBeenCalledWith('CreatePost', {
      payload: {
        title: 'Test Post',
        content: 'Test content',
        published: true
      }
    });
  });
});
```

## Deliverable: Component Library

### 5.1 Directory Structure
```
frontend/src/components/
├── atomic/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.styles.css
│   │   └── index.ts
│   ├── Input/
│   ├── Select/
│   └── ...
├── molecular/
│   ├── FormField/
│   ├── DataCard/
│   └── ...
├── organisms/
│   ├── UserList/
│   ├── UserForm/
│   └── ...
├── templates/
│   ├── AppLayout/
│   ├── PageLayout/
│   └── ...
└── index.ts
```

### 5.2 Component Documentation

Create `docs/component-catalog.json`:

```json
{
  "metadata": {
    "timestamp": "YYYY-MM-DD HH:mm:ss",
    "totalComponents": 45,
    "coverage": "98%"
  },
  "components": {
    "atomic": {
      "Button": {
        "props": ["children", "variant", "size", "disabled", "onClick"],
        "variants": ["primary", "secondary", "danger", "ghost"],
        "tests": 12,
        "coverage": "100%",
        "accessibility": "WCAG 2.1 AA"
      }
    },
    "molecular": {
      "FormField": {
        "composition": ["Label", "Input", "ErrorMessage"],
        "props": ["label", "name", "value", "error", "required"],
        "tests": 8,
        "validation": "built-in"
      }
    },
    "organisms": {
      "UserList": {
        "dataSource": "users store",
        "features": ["selection", "sorting", "filtering", "pagination"],
        "tests": 15,
        "performance": "virtualized for >1000 items"
      }
    }
  },
  "testingStrategy": {
    "unit": "all components isolated",
    "integration": "data flow scenarios",
    "visual": "snapshot testing",
    "accessibility": "automated a11y checks"
  }
}
```

## Validation Checklist

Before completing:
- [ ] All components have tests written first
- [ ] 100% test coverage for atomic components
- [ ] >90% coverage for all components
- [ ] Accessibility validated
- [ ] Performance benchmarks met
- [ ] TypeScript types complete
- [ ] Components documented
- [ ] Visual regression tests

## Next Phase

Output will be used by Phase 5 (Integration) to connect components with backend APIs and create full user flows.
