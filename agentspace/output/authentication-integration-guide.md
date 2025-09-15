# interaqt 框架第三方认证系统集成指南

## 概述

interaqt 是一个专注于响应式业务逻辑处理的框架，它的设计哲学是保持业务逻辑的纯粹性。因此，框架本身不包含用户认证功能，而是假设用户身份已经通过外部系统完成认证。

本指南将帮助您了解如何在 interaqt 应用中集成第三方认证系统，让您能够专注于业务逻辑开发，而不必重复实现认证功能。

## 核心原则

1. **认证分离**：认证逻辑完全由外部系统处理（如 JWT、OAuth 2.0、Session 等）
2. **预认证用户**：interaqt 接收已经认证的用户身份信息
3. **业务聚焦**：框架专注于业务逻辑的响应式处理
4. **安全边界**：认证和授权的安全边界在 interaqt 之外

## 架构设计

### 典型的集成架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   客户端应用    │────▶│   认证服务器    │────▶│  interaqt 应用  │
│  (Web/Mobile)   │     │ (Auth0/Keycloak)│     │   (业务逻辑)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         │  1. 登录请求          │                        │
         │──────────────────────▶│                        │
         │                       │                        │
         │  2. 返回 Token        │                        │
         │◀──────────────────────│                        │
         │                       │                        │
         │  3. 携带 Token 调用业务 API                    │
         │───────────────────────────────────────────────▶│
         │                                                │
         │  4. 返回业务数据                               │
         │◀───────────────────────────────────────────────│
```

## 实现方案

### 1. JWT (JSON Web Token) 集成

JWT 是最常见的无状态认证方案，适合分布式系统。

#### 服务端实现示例

```typescript
import express from 'express';
import jwt from 'jsonwebtoken';
import { Controller } from 'interaqt';
import { entities, relations, interactions, computations } from './backend';

const app = express();
app.use(express.json());

// JWT 验证中间件
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// 初始化 interaqt Controller
const controller = new Controller(
  entities,
  relations,
  interactions,
  computations
);

// 业务 API 端点
app.post('/api/interaction/:name', authenticateJWT, async (req, res) => {
  try {
    // 从 JWT 中获取的用户信息传递给 interaqt
    const result = await controller.callInteraction(req.params.name, {
      user: req.user,  // 预认证的用户信息
      payload: req.body
    });
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000);
```

#### 客户端调用示例

```javascript
// 客户端先通过认证服务获取 token
const token = await authService.login(username, password);

// 调用 interaqt 业务接口时携带 token
const response = await fetch('/api/interaction/CreatePost', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'My Post',
    content: 'Post content'
  })
});
```

### 2. OAuth 2.0 集成

OAuth 2.0 适合需要第三方登录的场景（如 Google、GitHub 登录）。

#### 使用 Passport.js 的示例

```typescript
import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Controller } from 'interaqt';
import { entities, relations, interactions, computations } from './backend';

const app = express();

// 配置 Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  // 将 OAuth 用户信息转换为应用用户格式
  const user = {
    id: profile.id,
    email: profile.emails[0].value,
    name: profile.displayName,
    role: 'user',  // 根据业务逻辑分配角色
    provider: 'google'
  };
  
  return done(null, user);
}));

// OAuth 认证路由
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    // 生成 JWT 或设置 session
    const token = generateJWT(req.user);
    res.redirect(`/dashboard?token=${token}`);
  }
);

// interaqt 业务接口
const controller = new Controller(entities, relations, interactions, computations);

app.post('/api/interaction/:name', ensureAuthenticated, async (req, res) => {
  const result = await controller.callInteraction(req.params.name, {
    user: req.user,
    payload: req.body
  });
  
  res.json(result);
});
```

### 3. Session 认证集成

对于传统的服务端渲染应用，可以使用 Session 认证。

```typescript
import express from 'express';
import session from 'express-session';
import { Controller } from 'interaqt';

const app = express();

// Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true }
}));

// 登录端点（由外部认证系统处理）
app.post('/login', async (req, res) => {
  // 验证用户凭证（这部分不是 interaqt 的职责）
  const user = await externalAuthService.authenticate(
    req.body.username,
    req.body.password
  );
  
  if (user) {
    req.session.user = user;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// interaqt 业务接口
const controller = new Controller(entities, relations, interactions, computations);

app.post('/api/interaction/:name', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const result = await controller.callInteraction(req.params.name, {
    user: req.session.user,
    payload: req.body
  });
  
  res.json(result);
});
```

## 在 interaqt 中使用用户信息

### 1. 定义 User 实体

即使认证由外部处理，您仍需要在 interaqt 中定义 User 实体来表示用户的业务属性。

```typescript
// entities/User.ts
import { Entity, Property } from 'interaqt';

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }),
    Property.create({ name: 'department', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
    // 注意：不要包含密码或认证相关字段
  ]
});
```

### 2. 在 Interaction 中使用用户信息

```typescript
// interactions/CreatePost.ts
import { Interaction, Action, Payload, PayloadItem, Condition } from 'interaqt';

// 权限条件
const CanCreatePost = Condition.create({
  name: 'CanCreatePost',
  content: async function(this: Controller, event) {
    // 检查用户角色
    if (!['author', 'admin'].includes(event.user?.role)) {
      return 'Only authors and admins can create posts';
    }
    
    // 检查用户状态
    if (event.user?.status !== 'active') {
      return 'Your account is not active';
    }
    
    return true;
  }
});

export const CreatePost = Interaction.create({
  name: 'CreatePost',
  action: Action.create({ name: 'create_post' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'title',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'content',
        base: 'string',
        required: true
      })
    ]
  }),
  conditions: CanCreatePost
});
```

### 3. 同步外部用户到 interaqt

当用户首次通过外部认证系统登录时，您可能需要在 interaqt 中创建对应的用户记录。

```typescript
// 在认证成功后同步用户
async function syncUserToInteraqt(controller: Controller, externalUser: any) {
  // 检查用户是否已存在
  const existingUser = await controller.system.storage.findOne(
    'User',
    MatchExp.atom({ key: 'id', value: ['=', externalUser.id] }),
    undefined,
    ['id']
  );
  
  if (!existingUser) {
    // 创建新用户
    await controller.system.storage.create('User', {
      id: externalUser.id,
      email: externalUser.email,
      name: externalUser.name,
      role: determineUserRole(externalUser),
      department: externalUser.department || 'general',
      status: 'active'
    });
  }
}
```

## 测试策略

在测试环境中，您不需要真正的认证系统，可以直接创建测试用户。

```typescript
// tests/post.spec.ts
import { describe, it, expect } from 'vitest';
import { Controller } from 'interaqt';

describe('Post Management', () => {
  let controller: Controller;
  let testUser: any;
  
  beforeEach(async () => {
    controller = new Controller(entities, relations, interactions, computations);
    
    // 直接创建测试用户，无需认证流程
    testUser = await controller.system.storage.create('User', {
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'author',
      status: 'active'
    });
  });
  
  it('should create post with authenticated user', async () => {
    const result = await controller.callInteraction('CreatePost', {
      user: testUser,  // 预认证的测试用户
      payload: {
        title: 'Test Post',
        content: 'Test content'
      }
    });
    
    expect(result.result.title).toBe('Test Post');
  });
});
```

## 最佳实践

### 1. 用户上下文传递

建立统一的用户上下文格式，确保在整个应用中一致：

```typescript
interface UserContext {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}
```

### 2. 错误处理

为认证相关错误提供清晰的错误信息：

```typescript
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  } else if (err.name === 'ForbiddenError') {
    res.status(403).json({
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  } else {
    next(err);
  }
});
```

### 3. 审计日志

记录所有用户操作以满足合规要求：

```typescript
// 在 Interaction 执行后记录
controller.on('interaction:executed', async (event) => {
  await auditLogger.log({
    userId: event.user.id,
    action: event.interaction,
    payload: event.payload,
    timestamp: new Date(),
    result: event.result
  });
});
```

### 4. Token 刷新策略

对于 JWT 认证，实现 token 刷新机制：

```typescript
// 刷新 token 端点
app.post('/auth/refresh', async (req, res) => {
  const refreshToken = req.body.refreshToken;
  
  try {
    const user = await verifyRefreshToken(refreshToken);
    const newAccessToken = generateAccessToken(user);
    
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

## 常见集成场景

### 1. 企业单点登录 (SSO)

使用 SAML 或 OIDC 协议集成企业 SSO：

```typescript
// 使用 passport-saml
import { Strategy as SamlStrategy } from 'passport-saml';

passport.use(new SamlStrategy({
  entryPoint: process.env.SAML_ENTRY_POINT,
  issuer: process.env.SAML_ISSUER,
  cert: process.env.SAML_CERT
}, (profile, done) => {
  const user = {
    id: profile.nameID,
    email: profile.email,
    name: profile.displayName,
    role: mapSAMLGroupsToRoles(profile.groups)
  };
  
  return done(null, user);
}));
```

### 2. 多租户系统

在用户上下文中包含租户信息：

```typescript
interface TenantUserContext extends UserContext {
  tenantId: string;
  tenantRole: string;
}

// 在 Interaction 中使用租户信息
const TenantScoped = Condition.create({
  name: 'TenantScoped',
  content: async function(this: Controller, event) {
    const resource = await this.system.storage.findOne(
      'Resource',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.resourceId] })
    );
    
    if (resource.tenantId !== event.user.tenantId) {
      return 'Access denied: resource belongs to different tenant';
    }
    
    return true;
  }
});
```

### 3. API Key 认证

对于机器对机器的通信：

```typescript
const authenticateAPIKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const client = await findClientByAPIKey(apiKey);
  
  if (!client) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  // 将客户端信息作为用户上下文
  req.user = {
    id: client.id,
    name: client.name,
    role: 'api_client',
    permissions: client.permissions
  };
  
  next();
};
```

## 总结

通过将认证逻辑委托给专门的外部系统，interaqt 让您能够：

1. **专注业务**：将精力集中在业务逻辑的实现上
2. **灵活选择**：自由选择最适合的认证方案
3. **安全可靠**：利用成熟的认证解决方案
4. **易于测试**：简化测试流程，无需模拟复杂的认证过程

记住，interaqt 的核心价值在于其强大的响应式业务逻辑处理能力。通过正确的架构设计，您可以轻松集成任何认证系统，同时保持业务逻辑的清晰和可维护性。

## 参考资源

- [JWT.io](https://jwt.io/) - JWT 标准和工具
- [OAuth 2.0](https://oauth.net/2/) - OAuth 2.0 协议规范
- [Passport.js](http://www.passportjs.org/) - Node.js 认证中间件
- [Auth0](https://auth0.com/) - 认证即服务平台
- [Keycloak](https://www.keycloak.org/) - 开源身份和访问管理
