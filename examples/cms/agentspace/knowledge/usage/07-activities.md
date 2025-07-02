# How to Use Activities for Process Management

Activities are the core mechanism in interaqt for managing complex business processes. They allow you to define multi-step, multi-role business processes and control the execution order and conditions of processes through a state machine model.

## Understanding Activity Concepts

### What is an Activity

An activity is a stateful business process that contains multiple related interactions and state transitions. Activities manage process execution through a state machine model:

- **State**: The state of the activity at a particular moment
- **Transfer**: Transition from one state to another
- **Condition**: Conditions that control whether a transfer can be executed
- **Interaction**: User operations that trigger state transfers

### Activities vs Independent Interactions

```javascript
// Independent interaction approach: each operation is independent
const SubmitOrder = Interaction.create({ name: 'SubmitOrder' });
const PayOrder = Interaction.create({ name: 'PayOrder' });
const ShipOrder = Interaction.create({ name: 'ShipOrder' });
const DeliverOrder = Interaction.create({ name: 'DeliverOrder' });

// Activity approach: organizing related operations into a process
const OrderProcessActivity = Activity.create({
  name: 'OrderProcess',
  interactions: [SubmitOrder, PayOrder, ShipOrder, DeliverOrder],
  transfers: [
    Transfer.create({
      name: 'submitOrder',
      source: SubmitOrder,
      target: PayOrder
    }),
    Transfer.create({
      name: 'payOrder',
      source: PayOrder,
      target: ShipOrder
    }),
    Transfer.create({
      name: 'shipOrder',
      source: ShipOrder,
      target: DeliverOrder
    })
  ]
});
```

## Creating Simple Activities

### Basic Activity Structure

```javascript
import { Activity, Transfer, Condition, Interaction } from 'interaqt';

// Define related interactions
const CreatePost = Interaction.create({
  name: 'CreatePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title' }),
      PayloadItem.create({ name: 'content' })
    ]
  })
});

const SubmitForReview = Interaction.create({
  name: 'SubmitForReview',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

const ApprovePost = Interaction.create({
  name: 'ApprovePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true }),
      PayloadItem.create({ name: 'reviewerId', base: User, isRef: true })
    ]
  })
});

const PublishPost = Interaction.create({
  name: 'PublishPost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', base: Post, isRef: true })
    ]
  })
});

// Create blog post activity
const BlogPostActivity = Activity.create({
  name: 'BlogPostWorkflow',
  interactions: [SubmitForReview, ApprovePost, PublishPost],
  transfers: [
    Transfer.create({
      name: 'submitForReview',
      source: SubmitForReview,
      target: ApprovePost
    }),
    Transfer.create({
      name: 'approvePost',
      source: ApprovePost,
      target: PublishPost
    })
  ]
});
```

### Setting Initial State

```javascript
const LeaveRequestActivity = Activity.create({
  name: 'LeaveRequestWorkflow',
  initialState: 'draft',  // State when activity starts
  states: [
    'draft',
    'submitted',
    'approved',
    'rejected',
    'cancelled'
  ],
  // ... transfers definition
});
```

## Defining State Transfers

### Sequential Transfers

The simplest type of transfer, executed in predefined order:

```javascript
const SimpleWorkflow = Activity.create({
  name: 'SimpleWorkflow',
  initialState: 'step1',
  states: ['step1', 'step2', 'step3', 'completed'],
  transfers: [
    Transfer.create({
      from: 'step1',
      to: 'step2',
      interaction: CompleteStep1
    }),
    Transfer.create({
      from: 'step2',
      to: 'step3',
      interaction: CompleteStep2
    }),
    Transfer.create({
      from: 'step3',
      to: 'completed',
      interaction: CompleteStep3
    })
  ]
});
```

### Conditional Transfers

Condition-based transfers that can only be executed when specific conditions are met:

```javascript
const ConditionalWorkflow = Activity.create({
  name: 'ConditionalWorkflow',
  initialState: 'submitted',
  states: ['submitted', 'approved', 'rejected', 'revision_needed'],
  transfers: [
    Transfer.create({
      from: 'submitted',
      to: 'approved',
      interaction: ReviewSubmission,
      condition: Condition.create({
        name: 'ApprovalCondition',
        condition: async (context) => {
          // Only score >= 80 can pass
          return context.payload.score >= 80;
        }
      })
    }),
    Transfer.create({
      from: 'submitted',
      to: 'rejected',
      interaction: ReviewSubmission,
      condition: Condition.create({
        name: 'RejectionCondition',
        condition: async (context) => {
          // Score < 60 is directly rejected
          return context.payload.score < 60;
        }
      })
    }),
    Transfer.create({
      from: 'submitted',
      to: 'revision_needed',
      interaction: ReviewSubmission,
      condition: Condition.create({
        name: 'RevisionCondition',
        condition: async (context) => {
          // Score between 60-79 needs revision
          return context.payload.score >= 60 && context.payload.score < 80;
        }
      })
    })
  ]
});
```

### Parallel Transfers

Allow transition from one state to multiple states:

```javascript
const ParallelWorkflow = Activity.create({
  name: 'ParallelWorkflow',
  initialState: 'submitted',
  states: ['submitted', 'technical_review', 'business_review', 'approved', 'rejected'],
  transfers: [
    // After submission, enter both technical and business review
    Transfer.create({
      from: 'submitted',
      to: 'technical_review',
      interaction: StartTechnicalReview,
      isParallel: true
    }),
    Transfer.create({
      from: 'submitted',
      to: 'business_review',
      interaction: StartBusinessReview,
      isParallel: true
    }),
    // Can only approve after both reviews are complete
    Transfer.create({
      from: ['technical_review', 'business_review'],  // Multiple prerequisite states
      to: 'approved',
      interaction: FinalApproval,
      condition: Condition.create({
        name: 'BothReviewsComplete',
        condition: async (context) => {
          const activity = context.activity;
          return activity.hasState('technical_review') && 
                 activity.hasState('business_review');
        }
      })
    })
  ]
});
```

### Loop Transfers

Allow cyclic transitions between states:

```javascript
const IterativeWorkflow = Activity.create({
  name: 'IterativeWorkflow',
  initialState: 'draft',
  states: ['draft', 'review', 'revision', 'approved'],
  transfers: [
    Transfer.create({
      from: 'draft',
      to: 'review',
      interaction: SubmitForReview
    }),
    Transfer.create({
      from: 'review',
      to: 'approved',
      interaction: ApproveDocument,
      condition: Condition.create({
        name: 'QualityCheck',
        condition: async (context) => context.payload.quality === 'excellent'
      })
    }),
    Transfer.create({
      from: 'review',
      to: 'revision',
      interaction: RequestRevision,
      condition: Condition.create({
        name: 'NeedsImprovement',
        condition: async (context) => context.payload.quality !== 'excellent'
      })
    }),
    // Loop: resubmit for review after revision
    Transfer.create({
      from: 'revision',
      to: 'review',
      interaction: ResubmitAfterRevision
    })
  ]
});
```

## Using Conditions to Control Processes

### Transfer Conditions

```javascript
const ConditionalTransfer = Transfer.create({
  from: 'pending',
  to: 'approved',
  interaction: ProcessRequest,
  condition: Condition.create({
    name: 'AutoApprovalCondition',
    condition: async (context) => {
      const request = context.data;
      const user = context.user;
      
      // Auto-approval conditions:
      // 1. Request amount < 1000
      // 2. User credit rating >= A
      // 3. User has good history
      return request.amount < 1000 && 
             user.creditRating >= 'A' && 
             user.hasGoodHistory === true;
    }
  })
});
```

### Interaction Execution Conditions

```javascript
const ConditionalInteraction = Interaction.create({
  name: 'ConditionalAction',
  condition: Condition.create({
    name: 'ExecutionCondition',
    condition: async (context) => {
      // Can only execute within specific time window
      const now = new Date();
      const hour = now.getHours();
      return hour >= 9 && hour < 17;  // Business hours
    }
  }),
  // ... other configuration
});
```

### Data-based Conditions

```javascript
const DataBasedCondition = Condition.create({
  name: 'DataBasedCondition',
  condition: async (context) => {
    const order = await context.findOne('Order', { id: context.payload.orderId });
    const user = await context.findOne('User', { id: order.userId });
    
    // Complex business logic judgment
    if (order.totalAmount > 10000) {
      // High-value orders need manager approval
      return user.role === 'manager';
    }
    
    if (order.isInternational) {
      // International orders need special permissions
      return user.permissions.includes('international_orders');
    }
    
    // Regular orders can be processed by anyone
    return true;
  }
});
```

### User-based Conditions

```javascript
const UserBasedCondition = Condition.create({
  name: 'UserBasedCondition',
  condition: async (context) => {
    const user = context.user;
    const targetUser = await context.findOne('User', { id: context.payload.targetUserId });
    
    // Permission check
    if (user.role === 'admin') {
      return true;  // Administrators can operate on any user
    }
    
    if (user.role === 'manager') {
      // Managers can only operate on subordinates
      return targetUser.managerId === user.id;
    }
    
    // Regular users can only operate on themselves
    return user.id === targetUser.id;
  }
});
```

## Implementing Complex Business Processes

### Multi-role Collaboration

```javascript
const MultiRoleWorkflow = Activity.create({
  name: 'ProjectApprovalWorkflow',
  initialState: 'draft',
  states: [
    'draft',
    'tech_review',
    'business_review',
    'budget_review',
    'final_approval',
    'approved',
    'rejected'
  ],
  transfers: [
    // Project manager submits for technical review
    Transfer.create({
      from: 'draft',
      to: 'tech_review',
      interaction: SubmitTechReview,
      condition: Condition.create({
        name: 'ProjectManagerOnly',
        condition: (context) => context.user.role === 'project_manager'
      })
    }),
    
    // Technical lead reviews
    Transfer.create({
      from: 'tech_review',
      to: 'business_review',
      interaction: ApproveTechReview,
      condition: Condition.create({
        name: 'TechLeadOnly',
        condition: (context) => context.user.role === 'tech_lead'
      })
    }),
    
    // Business lead reviews
    Transfer.create({
      from: 'business_review',
      to: 'budget_review',
      interaction: ApproveBusinessReview,
      condition: Condition.create({
        name: 'BusinessLeadOnly',
        condition: (context) => context.user.role === 'business_lead'
      })
    }),
    
    // Finance review (if budget exceeds threshold)
    Transfer.create({
      from: 'budget_review',
      to: 'final_approval',
      interaction: ApproveBudget,
      condition: Condition.create({
        name: 'FinanceApproval',
        condition: async (context) => {
          const project = context.data;
          if (project.budget > 100000) {
            return context.user.role === 'finance_manager';
          }
          return true;  // Auto-pass for smaller budgets
        }
      })
    }),
    
    // Final approval
    Transfer.create({
      from: 'final_approval',
      to: 'approved',
      interaction: FinalApproval,
      condition: Condition.create({
        name: 'CEOApproval',
        condition: (context) => context.user.role === 'ceo'
      })
    })
  ]
});
```

### Branching and Merging

```javascript
const BranchingWorkflow = Activity.create({
  name: 'BranchingWorkflow',
  initialState: 'start',
  states: [
    'start',
    'type_a_process',
    'type_b_process',
    'type_c_process',
    'merge_point',
    'final_step',
    'completed'
  ],
  transfers: [
    // Branch based on type
    Transfer.create({
      from: 'start',
      to: 'type_a_process',
      interaction: ProcessTypeA,
      condition: Condition.create({
        name: 'IsTypeA',
        condition: (context) => context.payload.type === 'A'
      })
    }),
    Transfer.create({
      from: 'start',
      to: 'type_b_process',
      interaction: ProcessTypeB,
      condition: Condition.create({
        name: 'IsTypeB',
        condition: (context) => context.payload.type === 'B'
      })
    }),
    Transfer.create({
      from: 'start',
      to: 'type_c_process',
      interaction: ProcessTypeC,
      condition: Condition.create({
        name: 'IsTypeC',
        condition: (context) => context.payload.type === 'C'
      })
    }),
    
    // All branches converge to merge point
    Transfer.create({
      from: 'type_a_process',
      to: 'merge_point',
      interaction: CompleteTypeAProcess
    }),
    Transfer.create({
      from: 'type_b_process',
      to: 'merge_point',
      interaction: CompleteTypeBProcess
    }),
    Transfer.create({
      from: 'type_c_process',
      to: 'merge_point',
      interaction: CompleteTypeCProcess
    }),
    
    // Common process after merge
    Transfer.create({
      from: 'merge_point',
      to: 'final_step',
      interaction: ProcessFinalStep
    }),
    Transfer.create({
      from: 'final_step',
      to: 'completed',
      interaction: CompleteWorkflow
    })
  ]
});
```

### Timeout Handling

```javascript
const TimeoutWorkflow = Activity.create({
  name: 'TimeoutWorkflow',
  initialState: 'waiting_approval',
  states: [
    'waiting_approval',
    'approved',
    'rejected',
    'auto_approved',  // Auto-approved after timeout
    'escalated'       // Escalated for handling
  ],
  transfers: [
    Transfer.create({
      from: 'waiting_approval',
      to: 'approved',
      interaction: ApproveRequest
    }),
    Transfer.create({
      from: 'waiting_approval',
      to: 'rejected',
      interaction: RejectRequest
    }),
    
    // Timeout handling
    Transfer.create({
      from: 'waiting_approval',
      to: 'auto_approved',
      interaction: TimeoutAutoApproval,
      condition: Condition.create({
        name: 'TimeoutCondition',
        condition: async (context) => {
          const activity = context.activity;
          const waitingTime = Date.now() - activity.enteredStateAt('waiting_approval');
          const timeoutDuration = 24 * 60 * 60 * 1000;  // 24 hours
          
          return waitingTime > timeoutDuration;
        }
      })
    }),
    
    // Escalation handling
    Transfer.create({
      from: 'waiting_approval',
      to: 'escalated',
      interaction: EscalateRequest,
      condition: Condition.create({
        name: 'EscalationCondition',
        condition: async (context) => {
          const activity = context.activity;
          const waitingTime = Date.now() - activity.enteredStateAt('waiting_approval');
          const escalationTime = 12 * 60 * 60 * 1000;  // Escalate after 12 hours
          
          return waitingTime > escalationTime;
        }
      })
    })
  ]
});
```

### Exception Handling

```javascript
const RobustWorkflow = Activity.create({
  name: 'RobustWorkflow',
  initialState: 'processing',
  states: [
    'processing',
    'completed',
    'failed',
    'retry',
    'manual_intervention',
    'cancelled'
  ],
  transfers: [
    Transfer.create({
      from: 'processing',
      to: 'completed',
      interaction: CompleteProcessing,
      condition: Condition.create({
        name: 'SuccessCondition',
        condition: (context) => context.payload.success === true
      })
    }),
    
    Transfer.create({
      from: 'processing',
      to: 'failed',
      interaction: HandleFailure,
      condition: Condition.create({
        name: 'FailureCondition',
        condition: (context) => context.payload.success === false
      })
    }),
    
    // Retry after failure
    Transfer.create({
      from: 'failed',
      to: 'retry',
      interaction: RetryProcessing,
      condition: Condition.create({
        name: 'CanRetry',
        condition: async (context) => {
          const activity = context.activity;
          const retryCount = activity.getMetadata('retryCount') || 0;
          return retryCount < 3;  // Maximum 3 retries
        }
      })
    }),
    
    // Manual intervention after retry failure
    Transfer.create({
      from: 'failed',
      to: 'manual_intervention',
      interaction: RequestManualIntervention,
      condition: Condition.create({
        name: 'NeedsManualIntervention',
        condition: async (context) => {
          const activity = context.activity;
          const retryCount = activity.getMetadata('retryCount') || 0;
          return retryCount >= 3;
        }
      })
    }),
    
    // Return to processing from retry state
    Transfer.create({
      from: 'retry',
      to: 'processing',
      interaction: RestartProcessing
    }),
    
    // Cancel workflow
    Transfer.create({
      from: ['processing', 'failed', 'retry'],
      to: 'cancelled',
      interaction: CancelWorkflow,
      condition: Condition.create({
        name: 'CanCancel',
        condition: (context) => context.user.role === 'admin'
      })
    })
  ]
});
```

## Activity Instance Management

### Starting Activities

```javascript
// Start a new activity instance
const activityInstance = await controller.startActivity('LeaveRequestWorkflow', {
  employeeId: 'user123',
  startDate: '2024-01-15',
  endDate: '2024-01-17',
  reason: 'Personal leave'
});

console.log('Activity started:', activityInstance.id);
console.log('Current state:', activityInstance.currentState);
```

### Executing State Transfers

```javascript
// Execute interaction to trigger state transfer
const result = await controller.executeActivityInteraction(
  activityInstance.id,
  'SubmitLeaveRequest',
  {
    requestId: activityInstance.data.requestId
  },
  {
    user: { id: 'user123', role: 'employee' }
  }
);

console.log('New state:', result.newState);
```

### Querying Activity State

```javascript
// Get current state of activity instance
const currentActivity = await controller.getActivity(activityInstance.id);
console.log('Current state:', currentActivity.currentState);
console.log('State history:', currentActivity.stateHistory);
console.log('Available transitions:', currentActivity.availableTransitions);

// Check if specific transfer can be executed
const canApprove = await controller.canExecuteTransition(
  activityInstance.id,
  'ApproveLeaveRequest',
  { user: { id: 'manager123', role: 'manager' } }
);
```

### Activity Lifecycle Management

```javascript
// Pause activity
await controller.pauseActivity(activityInstance.id);

// Resume activity
await controller.resumeActivity(activityInstance.id);

// Terminate activity
await controller.terminateActivity(activityInstance.id, 'User cancelled');

// Query activity history
const history = await controller.getActivityHistory(activityInstance.id);
```

## Best Practices

### 1. State Design Principles

```javascript
// ✅ Clear state naming
const states = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'published'
];

// ❌ Vague state naming
const states = [
  'state1',
  'processing',
  'done',
  'error'
];
```

### 2. Transfer Condition Design

```javascript
// ✅ Simple and clear conditions
const SimpleCondition = Condition.create({
  name: 'IsManager',
  condition: (context) => context.user.role === 'manager'
});

// ❌ Overly complex conditions
const ComplexCondition = Condition.create({
  name: 'ComplexCheck',
  condition: async (context) => {
    // Avoid executing complex business logic in conditions
    const result1 = await someComplexCalculation();
    const result2 = await anotherComplexOperation();
    return result1 && result2 && someOtherCondition();
  }
});
```

### 3. Error Handling

```javascript
// ✅ Activities that include error handling
const RobustActivity = Activity.create({
  name: 'RobustActivity',
  states: ['processing', 'completed', 'failed', 'error'],
  transfers: [
    // Normal flow
    Transfer.create({
      from: 'processing',
      to: 'completed',
      interaction: CompleteTask
    }),
    // Error handling
    Transfer.create({
      from: 'processing',
      to: 'error',
      interaction: HandleError,
      condition: Condition.create({
        name: 'ErrorOccurred',
        condition: (context) => context.payload.hasError === true
      })
    })
  ]
});
```

### 4. Performance Considerations

```javascript
// ✅ Efficient condition checking
const EfficientCondition = Condition.create({
  name: 'EfficientCondition',
  condition: async (context) => {
    // Check simple conditions first
    if (context.user.role === 'admin') {
      return true;
    }
    
    // Then check conditions requiring database queries
    const permission = await context.findOne('Permission', {
      user: context.user.id,
      resource: context.payload.resourceId
    });
    
    return !!permission;
  }
});
```

The activity system provides interaqt with powerful process management capabilities. Through proper design of activities, states, and transfers, you can implement complex business process control while maintaining code clarity and maintainability. 