# 如何使用活动（Activity）管理流程

活动（Activity）是 interaqt 中用于管理复杂业务流程的核心机制。它允许你定义多步骤、多角色的业务流程，通过状态机模型来控制流程的执行顺序和条件。

## 理解活动概念

### 什么是活动

活动是一个有状态的业务流程，它包含多个相关的交互（Interaction）和状态转换。活动通过状态机模型来管理流程的执行：

- **状态（State）**：活动在某个时刻的状态
- **转移（Transfer）**：从一个状态到另一个状态的转换
- **条件（Condition）**：控制转移是否可以执行的条件
- **交互（Interaction）**：触发状态转移的用户操作

### 活动 vs 独立交互

```javascript
// 独立交互方式：每个操作都是独立的
const SubmitOrder = Interaction.create({ name: 'SubmitOrder' });
const PayOrder = Interaction.create({ name: 'PayOrder' });
const ShipOrder = Interaction.create({ name: 'ShipOrder' });
const DeliverOrder = Interaction.create({ name: 'DeliverOrder' });

// 活动方式：将相关操作组织成流程
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

## 创建简单活动

### 基本活动结构

```javascript
import { Activity, Transfer, Condition, Interaction } from 'interaqt';

// 定义相关的交互
const CreatePost = Interaction.create({
  name: 'CreatePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'title', type: 'string' }),
      PayloadItem.create({ name: 'content', type: 'string' })
    ]
  })
});

const SubmitForReview = Interaction.create({
  name: 'SubmitForReview',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' })
    ]
  })
});

const ApprovePost = Interaction.create({
  name: 'ApprovePost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' }),
      PayloadItem.create({ name: 'reviewerId', type: 'string', isRef: true, refEntity: 'User' })
    ]
  })
});

const PublishPost = Interaction.create({
  name: 'PublishPost',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'postId', type: 'string', isRef: true, refEntity: 'Post' })
    ]
  })
});

// 创建文章发布活动
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

### 设置初始状态

```javascript
const LeaveRequestActivity = Activity.create({
  name: 'LeaveRequestWorkflow',
  initialState: 'draft',  // 活动开始时的状态
  states: [
    'draft',
    'submitted',
    'approved',
    'rejected',
    'cancelled'
  ],
  // ... transfers 定义
});
```

## 定义状态转移（Transfer）

### 顺序转移

最简单的转移类型，按照预定义的顺序执行：

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

### 条件转移

基于条件的转移，只有满足特定条件时才能执行：

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
          // 只有评分 >= 80 才能通过
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
          // 评分 < 60 直接拒绝
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
          // 评分在 60-79 之间需要修改
          return context.payload.score >= 60 && context.payload.score < 80;
        }
      })
    })
  ]
});
```

### 并行转移

允许从一个状态转移到多个状态：

```javascript
const ParallelWorkflow = Activity.create({
  name: 'ParallelWorkflow',
  initialState: 'submitted',
  states: ['submitted', 'technical_review', 'business_review', 'approved', 'rejected'],
  transfers: [
    // 提交后同时进入技术审核和业务审核
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
    // 两个审核都完成后才能批准
    Transfer.create({
      from: ['technical_review', 'business_review'],  // 多个前置状态
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

### 循环转移

允许状态之间的循环转换：

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
    // 循环：修订后重新提交审核
    Transfer.create({
      from: 'revision',
      to: 'review',
      interaction: ResubmitAfterRevision
    })
  ]
});
```

## 使用条件（Condition）控制流程

### 转移条件

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
      
      // 自动批准条件：
      // 1. 请求金额小于 1000
      // 2. 用户信用等级 >= A
      // 3. 用户历史记录良好
      return request.amount < 1000 && 
             user.creditRating >= 'A' && 
             user.hasGoodHistory === true;
    }
  })
});
```

### 交互执行条件

```javascript
const ConditionalInteraction = Interaction.create({
  name: 'ConditionalAction',
  condition: Condition.create({
    name: 'ExecutionCondition',
    condition: async (context) => {
      // 只有在特定时间窗口内才能执行
      const now = new Date();
      const hour = now.getHours();
      return hour >= 9 && hour < 17;  // 工作时间
    }
  }),
  // ... 其他配置
});
```

### 基于数据的条件

```javascript
const DataBasedCondition = Condition.create({
  name: 'DataBasedCondition',
  condition: async (context) => {
    const order = await context.findOne('Order', { id: context.payload.orderId });
    const user = await context.findOne('User', { id: order.userId });
    
    // 复杂的业务逻辑判断
    if (order.totalAmount > 10000) {
      // 高价值订单需要经理审批
      return user.role === 'manager';
    }
    
    if (order.isInternational) {
      // 国际订单需要特殊权限
      return user.permissions.includes('international_orders');
    }
    
    // 普通订单任何人都可以处理
    return true;
  }
});
```

### 基于用户的条件

```javascript
const UserBasedCondition = Condition.create({
  name: 'UserBasedCondition',
  condition: async (context) => {
    const user = context.user;
    const targetUser = await context.findOne('User', { id: context.payload.targetUserId });
    
    // 权限检查
    if (user.role === 'admin') {
      return true;  // 管理员可以操作任何用户
    }
    
    if (user.role === 'manager') {
      // 经理只能操作下属
      return targetUser.managerId === user.id;
    }
    
    // 普通用户只能操作自己
    return user.id === targetUser.id;
  }
});
```

## 实现复杂业务流程

### 多角色协作

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
    // 项目经理提交技术审核
    Transfer.create({
      from: 'draft',
      to: 'tech_review',
      interaction: SubmitTechReview,
      condition: Condition.create({
        name: 'ProjectManagerOnly',
        condition: (context) => context.user.role === 'project_manager'
      })
    }),
    
    // 技术负责人审核
    Transfer.create({
      from: 'tech_review',
      to: 'business_review',
      interaction: ApproveTechReview,
      condition: Condition.create({
        name: 'TechLeadOnly',
        condition: (context) => context.user.role === 'tech_lead'
      })
    }),
    
    // 业务负责人审核
    Transfer.create({
      from: 'business_review',
      to: 'budget_review',
      interaction: ApproveBusinessReview,
      condition: Condition.create({
        name: 'BusinessLeadOnly',
        condition: (context) => context.user.role === 'business_lead'
      })
    }),
    
    // 财务审核（如果预算超过阈值）
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
          return true;  // 预算较小时自动通过
        }
      })
    }),
    
    // 最终批准
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

### 分支和合并

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
    // 根据类型分支
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
    
    // 所有分支都汇聚到合并点
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
    
    // 合并后的共同流程
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

### 超时处理

```javascript
const TimeoutWorkflow = Activity.create({
  name: 'TimeoutWorkflow',
  initialState: 'waiting_approval',
  states: [
    'waiting_approval',
    'approved',
    'rejected',
    'auto_approved',  // 超时自动批准
    'escalated'       // 升级处理
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
    
    // 超时处理
    Transfer.create({
      from: 'waiting_approval',
      to: 'auto_approved',
      interaction: TimeoutAutoApproval,
      condition: Condition.create({
        name: 'TimeoutCondition',
        condition: async (context) => {
          const activity = context.activity;
          const waitingTime = Date.now() - activity.enteredStateAt('waiting_approval');
          const timeoutDuration = 24 * 60 * 60 * 1000;  // 24小时
          
          return waitingTime > timeoutDuration;
        }
      })
    }),
    
    // 升级处理
    Transfer.create({
      from: 'waiting_approval',
      to: 'escalated',
      interaction: EscalateRequest,
      condition: Condition.create({
        name: 'EscalationCondition',
        condition: async (context) => {
          const activity = context.activity;
          const waitingTime = Date.now() - activity.enteredStateAt('waiting_approval');
          const escalationTime = 12 * 60 * 60 * 1000;  // 12小时后升级
          
          return waitingTime > escalationTime;
        }
      })
    })
  ]
});
```

### 异常处理

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
    
    // 失败后重试
    Transfer.create({
      from: 'failed',
      to: 'retry',
      interaction: RetryProcessing,
      condition: Condition.create({
        name: 'CanRetry',
        condition: async (context) => {
          const activity = context.activity;
          const retryCount = activity.getMetadata('retryCount') || 0;
          return retryCount < 3;  // 最多重试3次
        }
      })
    }),
    
    // 重试失败后人工介入
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
    
    // 从重试状态回到处理状态
    Transfer.create({
      from: 'retry',
      to: 'processing',
      interaction: RestartProcessing
    }),
    
    // 取消流程
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

## 活动实例管理

### 启动活动

```javascript
// 启动一个新的活动实例
const activityInstance = await controller.startActivity('LeaveRequestWorkflow', {
  employeeId: 'user123',
  startDate: '2024-01-15',
  endDate: '2024-01-17',
  reason: 'Personal leave'
});

console.log('Activity started:', activityInstance.id);
console.log('Current state:', activityInstance.currentState);
```

### 执行状态转移

```javascript
// 执行交互来触发状态转移
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

### 查询活动状态

```javascript
// 获取活动实例的当前状态
const currentActivity = await controller.getActivity(activityInstance.id);
console.log('Current state:', currentActivity.currentState);
console.log('State history:', currentActivity.stateHistory);
console.log('Available transitions:', currentActivity.availableTransitions);

// 检查是否可以执行特定转移
const canApprove = await controller.canExecuteTransition(
  activityInstance.id,
  'ApproveLeaveRequest',
  { user: { id: 'manager123', role: 'manager' } }
);
```

### 活动生命周期管理

```javascript
// 暂停活动
await controller.pauseActivity(activityInstance.id);

// 恢复活动
await controller.resumeActivity(activityInstance.id);

// 终止活动
await controller.terminateActivity(activityInstance.id, 'User cancelled');

// 查询活动历史
const history = await controller.getActivityHistory(activityInstance.id);
```

## 最佳实践

### 1. 状态设计原则

```javascript
// ✅ 清晰的状态命名
const states = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'published'
];

// ❌ 模糊的状态命名
const states = [
  'state1',
  'processing',
  'done',
  'error'
];
```

### 2. 转移条件设计

```javascript
// ✅ 简单明确的条件
const SimpleCondition = Condition.create({
  name: 'IsManager',
  condition: (context) => context.user.role === 'manager'
});

// ❌ 过于复杂的条件
const ComplexCondition = Condition.create({
  name: 'ComplexCheck',
  condition: async (context) => {
    // 避免在条件中执行复杂的业务逻辑
    const result1 = await someComplexCalculation();
    const result2 = await anotherComplexOperation();
    return result1 && result2 && someOtherCondition();
  }
});
```

### 3. 错误处理

```javascript
// ✅ 包含错误处理的活动
const RobustActivity = Activity.create({
  name: 'RobustActivity',
  states: ['processing', 'completed', 'failed', 'error'],
  transfers: [
    // 正常流程
    Transfer.create({
      from: 'processing',
      to: 'completed',
      interaction: CompleteTask
    }),
    // 错误处理
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

### 4. 性能考虑

```javascript
// ✅ 高效的条件检查
const EfficientCondition = Condition.create({
  name: 'EfficientCondition',
  condition: async (context) => {
    // 先检查简单条件
    if (context.user.role === 'admin') {
      return true;
    }
    
    // 再检查需要数据库查询的条件
    const permission = await context.findOne('Permission', {
      user: context.user.id,
      resource: context.payload.resourceId
    });
    
    return !!permission;
  }
});
```

活动系统为 interaqt 提供了强大的流程管理能力，通过合理设计活动、状态和转移，可以实现复杂的业务流程控制，同时保持代码的清晰和可维护性。 