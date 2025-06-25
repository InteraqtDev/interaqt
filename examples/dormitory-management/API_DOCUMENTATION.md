# 宿舍管理系统 API 调用文档

## 概述

本文档描述如何通过 HTTP API 调用 interaqt 框架定义的 Interaction。

## 服务器配置

### 启动服务器
```bash
npm run dev  # 启动开发服务器，默认端口 3000
```

### 服务器端点
- **基础 URL**: `http://localhost:3000`
- **交互端点**: `POST /interaction`
- **数据 API 端点**: `POST /api/:apiName`
- **健康检测**: `GET /ping`

## 用户身份模拟

### 通过 Header 模拟用户身份

服务器通过 `parseUserId` 函数从请求头中解析用户身份。在开发环境中，可以通过以下方式模拟：

```javascript
// 请求头中添加用户ID
headers: {
  'x-user-id': 'user123',  // 根据实际实现调整header名称
  'content-type': 'application/json'
}
```

### 通过 URL Query 模拟用户身份

前端 SDK 将支持通过 URL query 参数 `userId` 来模拟用户身份：

```
http://localhost:5174/?userId=user123
```

## API 调用格式

### 1. 调用 Interaction

**端点**: `POST /interaction`

**请求体格式**:
```typescript
{
  interaction: string,  // Interaction 名称
  payload?: object,     // 载荷数据
  query?: object       // 查询参数
}
```

**响应格式**:
```typescript
{
  data?: any,      // 返回数据（对于查询类 interaction）
  result?: any,    // 操作结果
  error?: string   // 错误信息
}
```

## 可用的 Interactions

### 管理员操作

#### 1. 创建宿舍
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "CreateDormitory",
  "payload": {
    "name": "梅园1号楼101",
    "building": "梅园1号楼", 
    "roomNumber": "101",
    "capacity": 4,
    "description": "南向，采光良好"
  }
}
```

#### 2. 指定宿舍长
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "AssignDormitoryLeader",
  "payload": {
    "dormitoryId": "dormitory_id",
    "userId": "student_user_id"
  }
}
```

#### 3. 直接分配成员到宿舍
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "AssignMemberToDormitory", 
  "payload": {
    "dormitoryId": "dormitory_id",
    "userId": "student_user_id",
    "bedNumber": "1"
  }
}
```

#### 4. 批准踢出申请
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "ApproveKickRequest",
  "payload": {
    "kickRequestId": "kick_request_id",
    "adminComment": "同意踢出，理由充分"
  }
}
```

#### 5. 拒绝踢出申请
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "RejectKickRequest",
  "payload": {
    "kickRequestId": "kick_request_id", 
    "adminComment": "理由不充分，拒绝踢出"
  }
}
```

#### 6. 管理员最终审批申请
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "AdminApproveApplication",
  "payload": {
    "applicationId": "application_id",
    "adminComment": "批准入住",
    "bedNumber": "2"
  }
}
```

#### 7. 管理员拒绝申请
```http
POST /interaction
Content-Type: application/json
x-user-id: admin_user_id

{
  "interaction": "AdminRejectApplication",
  "payload": {
    "applicationId": "application_id",
    "adminComment": "宿舍已满，拒绝申请"
  }
}
```

### 宿舍长操作

#### 1. 宿舍长审批申请
```http
POST /interaction
Content-Type: application/json
x-user-id: leader_user_id

{
  "interaction": "LeaderApproveApplication",
  "payload": {
    "applicationId": "application_id",
    "leaderComment": "欢迎加入本宿舍"
  }
}
```

#### 2. 宿舍长拒绝申请
```http
POST /interaction
Content-Type: application/json
x-user-id: leader_user_id

{
  "interaction": "LeaderRejectApplication",
  "payload": {
    "applicationId": "application_id",
    "leaderComment": "不符合宿舍要求"
  }
}
```

#### 3. 记录积分
```http
POST /interaction
Content-Type: application/json
x-user-id: leader_user_id

{
  "interaction": "RecordScore",
  "payload": {
    "memberId": "member_id",
    "points": 10,
    "reason": "卫生检查优秀",
    "category": "hygiene"
  }
}
```

#### 4. 申请踢出成员
```http
POST /interaction
Content-Type: application/json
x-user-id: leader_user_id

{
  "interaction": "RequestKickMember",
  "payload": {
    "memberId": "member_id",
    "reason": "严重违反宿舍纪律"
  }
}
```

### 学生操作

#### 1. 申请加入宿舍
```http
POST /interaction
Content-Type: application/json
x-user-id: student_user_id

{
  "interaction": "ApplyForDormitory",
  "payload": {
    "dormitoryId": "dormitory_id",
    "message": "希望能加入这个宿舍"
  }
}
```

#### 2. 取消申请
```http
POST /interaction
Content-Type: application/json
x-user-id: student_user_id

{
  "interaction": "CancelApplication",
  "payload": {
    "applicationId": "application_id"
  }
}
```

### 查询操作（所有角色）

#### 1. 获取宿舍列表
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetDormitories",
  "query": {
    // 可选的查询条件
    "where": {
      "building": "梅园1号楼"
    },
    "limit": 10
  }
}
```

#### 2. 获取用户信息
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetUsers",
  "query": {
    "where": {
      "role": "student"
    }
  }
}
```

#### 3. 获取宿舍成员
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetDormitoryMembers",
  "query": {
    "where": {
      "dormitory.id": "dormitory_id",
      "status": "active"
    }
  }
}
```

#### 4. 获取申请列表
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetApplications", 
  "query": {
    "where": {
      "status": "pending"
    }
  }
}
```

#### 5. 获取积分记录
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetScoreRecords",
  "query": {
    "where": {
      "member.id": "member_id"
    },
    "orderBy": [["createdAt", "desc"]]
  }
}
```

#### 6. 获取踢出申请
```http
POST /interaction
Content-Type: application/json
x-user-id: any_user_id

{
  "interaction": "GetKickRequests",
  "query": {
    "where": {
      "status": "pending" 
    }
  }
}
```

## 查询语法

对于 `GetXXX` 类型的 interaction，`query` 参数支持以下语法：

### where 条件
```javascript
{
  "where": {
    "field": "value",                    // 等于
    "field": [">=", 10],                // 大于等于 
    "field": ["in", ["value1", "value2"]], // 包含
    "field.nested": "value"             // 嵌套字段
  }
}
```

### 排序
```javascript
{
  "orderBy": [
    ["field", "asc"],   // 升序
    ["field", "desc"]   // 降序
  ]
}
```

### 分页
```javascript
{
  "limit": 10,    // 限制数量
  "offset": 20    // 偏移量
}
```

### 字段选择
```javascript
{
  "select": ["field1", "field2"]  // 只返回指定字段
}
```

## 错误处理

### 常见错误状态码
- **401 Unauthorized**: 用户身份认证失败
- **400 Bad Request**: 请求参数错误或业务逻辑错误
- **404 Not Found**: 资源不存在
- **500 Internal Server Error**: 服务器内部错误

### 错误响应格式
```javascript
{
  "error": "错误描述信息",
  "statusCode": 400,
  "details": {
    // 详细错误信息
  }
}
```

## 权限说明

不同的 Interaction 有不同的权限要求：

### 管理员权限
- CreateDormitory, AssignDormitoryLeader, AssignMemberToDormitory
- ApproveKickRequest, RejectKickRequest
- AdminApproveApplication, AdminRejectApplication

### 宿舍长权限  
- LeaderApproveApplication, LeaderRejectApplication
- RecordScore, RequestKickMember

### 学生权限
- ApplyForDormitory, CancelApplication

### 无权限限制
- 所有 GetXXX 查询操作

## 开发调试

### 使用 curl 测试
```bash
# 创建宿舍
curl -X POST http://localhost:3000/interaction \
  -H "Content-Type: application/json" \
  -H "x-user-id: admin123" \
  -d '{
    "interaction": "CreateDormitory",
    "payload": {
      "name": "测试宿舍",
      "building": "测试楼",
      "roomNumber": "101", 
      "capacity": 4,
      "description": "测试用宿舍"
    }
  }'
```

### 健康检测
```bash
curl http://localhost:3000/ping
# 响应: {"message": "pong"}
```

## 注意事项

1. 所有请求都需要设置正确的 `Content-Type: application/json`
2. 用户身份通过请求头传递，具体的 header 名称需要根据服务器配置确定
3. 引用类型的字段（如 dormitoryId, userId）需要传递有效的 ID 值
4. 查询操作返回的数据包含完整的关联信息
5. 权限验证失败时会返回 401 或 403 错误
6. 业务逻辑验证失败时会返回 400 错误并包含详细信息