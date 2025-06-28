# 简化版前端函数使用指南

## 生成结果概览

脚本已成功生成了 **19 个简化的 async 函数**，移除了 axii atom 依赖，现在每个函数都是纯粹的 fetch 包装器。

### ✅ 改进对比

**之前（复杂版）：**
```typescript
// 复杂的 atom 状态管理
export function createDormitory(...params) {
  const data = atom<any>(null);
  const error = atom<string | null>(null);
  const status = atom<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  const execute = async () => {
    // 复杂的状态处理逻辑...
  };
  
  execute(); // 立即执行
  
  return { data, error, status, refetch: execute };
}
```

**现在（简化版）：**
```typescript
// 简洁的 async 函数
export async function createDormitory(name: any, building: any, roomNumber: any, capacity: any, description: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
    interaction: 'CreateDormitory',
    payload: { name, building, roomNumber, capacity, description }
  };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}
```

## 使用示例

### 基本调用

```typescript
import { createDormitory, getDormitories, applyForDormitory } from './utils/generatedInteractions';

// 创建宿舍（管理员操作）
try {
  const result = await createDormitory('A101', 'A栋', '101', 4, '标准四人间');
  console.log('创建成功:', result);
} catch (error) {
  console.error('创建失败:', error.message);
}

// 查询宿舍列表
try {
  const dormitories = await getDormitories({
    where: { capacity: { $gte: 2 } },
    orderBy: [['name', 'asc']],
    limit: 10
  });
  console.log('宿舍列表:', dormitories);
} catch (error) {
  console.error('查询失败:', error.message);
}

// 学生申请宿舍
try {
  const application = await applyForDormitory('dorm-123', '希望加入这个宿舍');
  console.log('申请提交成功:', application);
} catch (error) {
  console.error('申请失败:', error.message);
}
```

### 与 Action 工具结合使用

由于函数现在是简单的 async 函数，可以很容易地与各种状态管理工具结合：

#### 与 React Query / TanStack Query

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { getDormitories, createDormitory } from './utils/generatedInteractions';

// 查询
function useDormitories() {
  return useQuery({
    queryKey: ['dormitories'],
    queryFn: () => getDormitories()
  });
}

// 变更
function useCreateDormitory() {
  return useMutation({
    mutationFn: (params: {name: string, building: string, roomNumber: string, capacity: number, description: string}) => 
      createDormitory(params.name, params.building, params.roomNumber, params.capacity, params.description),
    onSuccess: () => {
      // 重新获取宿舍列表
      queryClient.invalidateQueries({ queryKey: ['dormitories'] });
    }
  });
}
```

#### 与 SWR

```typescript
import useSWR from 'swr';
import { getDormitories } from './utils/generatedInteractions';

function DormitoryList() {
  const { data, error, isLoading } = useSWR('/dormitories', () => getDormitories());
  
  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  
  return (
    <div>
      {data?.map(dorm => (
        <div key={dorm.id}>{dorm.name}</div>
      ))}
    </div>
  );
}
```

#### 与自定义 Action 包装器

```typescript
// 自定义 Action 包装器
function createAction<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (...args: Parameters<T>) => {
    const data = ref(null);
    const error = ref(null);
    const loading = ref(false);
    
    const execute = async () => {
      try {
        loading.value = true;
        error.value = null;
        data.value = await fn(...args);
      } catch (err) {
        error.value = err;
      } finally {
        loading.value = false;
      }
    };
    
    return { data, error, loading, execute };
  };
}

// 使用包装器
const createDormitoryAction = createAction(createDormitory);
const getDormitoriesAction = createAction(getDormitories);

// 在组件中使用
const { data, error, loading, execute } = createDormitoryAction();
```

## 函数分类

### 管理员操作（7个）
```typescript
await createDormitory(name, building, roomNumber, capacity, description);
await assignDormitoryLeader(dormitoryId, userId);
await assignMemberToDormitory(dormitoryId, userId, bedNumber);
await approveKickRequest(kickRequestId, adminComment);
await rejectKickRequest(kickRequestId, adminComment);
await adminApproveApplication(applicationId, adminComment, bedNumber);
await adminRejectApplication(applicationId, adminComment);
```

### 宿舍长操作（4个）
```typescript
await leaderApproveApplication(applicationId, leaderComment);
await leaderRejectApplication(applicationId, leaderComment);
await recordScore(memberId, points, reason, category);
await requestKickMember(memberId, reason);
```

### 学生操作（2个）
```typescript
await applyForDormitory(dormitoryId, message);
await cancelApplication(applicationId);
```

### 查询操作（6个）
```typescript
await getDormitories(query?);
await getUsers(query?);
await getDormitoryMembers(query?);
await getApplications(query?);
await getScoreRecords(query?);
await getKickRequests(query?);
```

## 优势总结

### ✨ 简洁性
- 每个函数只有 ~20 行代码
- 没有复杂的状态管理
- 直接返回数据或抛出错误

### 🔧 灵活性  
- 可以与任何状态管理库结合
- 支持自定义错误处理
- 易于测试和调试

### 🚀 性能
- 没有不必要的响应式开销
- 按需调用，不会立即执行
- 更小的包体积（无 axii 依赖）

### 📦 兼容性
- 标准的 Promise 接口
- 兼容所有现代前端框架
- 支持 TypeScript 类型推断

## 文件结构

```
frontend/src/utils/
├── generatedInteractions.ts    # 生成的 19 个函数 (605 行)
└── [你的 action 包装器]        # 自定义状态管理包装器
```

## 总结

🎉 **简化版本完成！**

现在生成的函数：
- ✅ 移除了 axii atom 依赖
- ✅ 每个函数都是简单的 async 函数  
- ✅ 直接返回数据或抛出错误
- ✅ 可以轻松与任何状态管理工具结合
- ✅ 代码更简洁，从 1127 行减少到 605 行

这种设计给了您最大的灵活性，可以根据项目需要选择合适的状态管理方案！ 