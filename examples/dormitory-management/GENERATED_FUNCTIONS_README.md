# 自动生成的前端 Interaction 函数使用指南

这个文档说明了如何使用自动生成的前端函数来调用后端 Interaction。

## 文件说明

### 脚本文件
- `generate-interaction-functions.ts` - 自动转换脚本
- `frontend/src/utils/generatedInteractions.ts` - 生成的前端函数

### 运行脚本
```bash
npx tsx generate-interaction-functions.ts
```

## 生成的函数特点

### ✅ 完成的功能

1. **自动解析后端 Interaction** - 从 `src/interactions.ts` 自动提取所有 19 个 Interaction
2. **正确的参数提取** - 自动从 PayloadItem 中提取参数名称
3. **axii atom 集成** - 每个函数返回 `data`、`error`、`status` 三个 atom
4. **立即执行** - 函数调用后立即发起 HTTP 请求
5. **错误处理** - 内置错误处理和状态管理
6. **重试功能** - 提供 `refetch` 函数支持重新执行

### 📋 生成的函数列表

**管理员操作:**
- `createDormitory(name, building, roomNumber, capacity, description, query?)`
- `assignDormitoryLeader(dormitoryId, userId, query?)`
- `assignMemberToDormitory(dormitoryId, userId, bedNumber, query?)`
- `approveKickRequest(kickRequestId, adminComment, query?)`
- `rejectKickRequest(kickRequestId, adminComment, query?)`
- `adminApproveApplication(applicationId, adminComment, bedNumber, query?)`
- `adminRejectApplication(applicationId, adminComment, query?)`

**宿舍长操作:**
- `leaderApproveApplication(applicationId, leaderComment, query?)`
- `leaderRejectApplication(applicationId, leaderComment, query?)`
- `recordScore(memberId, points, reason, category, query?)`
- `requestKickMember(memberId, reason, query?)`

**学生操作:**
- `applyForDormitory(dormitoryId, message, query?)`
- `cancelApplication(applicationId, query?)`

**查询操作:**
- `getDormitories(query?)`
- `getUsers(query?)`
- `getDormitoryMembers(query?)`
- `getApplications(query?)`
- `getScoreRecords(query?)`
- `getKickRequests(query?)`

## 使用方法

### 基本用法

```typescript
import { createDormitory, getDormitories } from './utils/generatedInteractions';

// 创建宿舍
const { data, error, status, refetch } = createDormitory(
  'A101', 
  'A栋', 
  '101', 
  4, 
  '标准四人间'
);

// 查询宿舍列表
const { data: dormitories, error: queryError, status: queryStatus } = getDormitories({
  where: { capacity: { $gte: 2 } },
  orderBy: [['name', 'asc']]
});
```

### 在 axii 组件中使用

```typescript
import { createElement } from 'axii';
import { getDormitories } from './utils/generatedInteractions';

export function DormitoryList() {
  const { data, error, status, refetch } = getDormitories();

  return () => createElement('div', {}, [
    createElement('h3', {}, '宿舍列表'),
    createElement('button', { onClick: refetch }, '刷新'),
    
    status() === 'loading' && createElement('div', {}, '加载中...'),
    status() === 'error' && createElement('div', { style: { color: 'red' } }, `错误: ${error()}`),
    status() === 'success' && createElement('div', {}, 
      data()?.map(dorm => createElement('div', { key: dorm.id }, dorm.name))
    )
  ].filter(Boolean));
}
```

### Atom 状态说明

每个函数返回的对象包含：

- `data: atom<any>` - 响应数据
- `error: atom<string | null>` - 错误信息
- `status: atom<'idle' | 'loading' | 'success' | 'error'>` - 请求状态
- `refetch: () => void` - 重新执行函数

### 状态管理

```typescript
const { data, error, status, refetch } = someFunction();

// 读取状态
console.log('当前状态:', status());
console.log('数据:', data());
console.log('错误:', error());

// 重新执行
refetch();
```

## 技术实现

### 脚本工作原理
- **直接 Import**：使用 `import { interactions } from './src/interactions.js'`
- **运行时解析**：直接访问 Interaction 对象获取准确信息
- **参数提取**：从 `interaction.payload.items` 中读取参数名称
- **类型识别**：自动识别 Get 类型的查询操作

### URL 配置
- 所有请求发送到 `POST /interaction`
- 通过 `interaction` 字段指定要调用的 Interaction 名称
- 支持 `payload` 和 `query` 参数

### 用户认证
- 从 URL 参数 `?userId=xxx` 获取用户 ID
- 通过 `Authorization: Bearer ${userId}` 头发送

### 错误处理
- 自动处理 HTTP 错误
- 解析后端返回的错误信息
- 设置合适的错误状态

## 优势

1. **自动生成** - 无需手动编写每个 API 调用函数
2. **100% 准确** - 直接从运行时对象提取信息，避免解析错误
3. **类型安全** - 参数名称直接从后端 Interaction 定义提取
4. **一致性** - 所有函数使用相同的模式和错误处理
5. **响应式** - 完全集成 axii 的 atom 系统
6. **易于维护** - 后端 Interaction 变更时重新运行脚本即可
7. **高可靠性** - 使用 import 而非正则解析，更稳定可靠

## 扩展性

如需修改生成逻辑：

1. 编辑 `generate-interaction-functions.ts`
2. 重新运行脚本：`npx tsx generate-interaction-functions.ts`
3. 新的函数将覆盖原有文件

## 注意事项

- 确保设置正确的用户 ID (`?userId=xxx`)
- 后端服务需要运行在 `http://localhost:3000`
- 生成的函数会立即执行，适合数据获取场景
- 对于需要用户触发的操作，建议在事件处理器中调用 