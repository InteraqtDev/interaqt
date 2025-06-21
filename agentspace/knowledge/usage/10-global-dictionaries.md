# 10. 如何使用全局字典（Dictionary）

全局字典是 @interaqt/runtime 框架中用于管理全局状态和配置的重要机制。它提供了一种声明式的方式来定义和维护系统级别的数据，这些数据可以被整个应用中的其他组件引用和响应。

## 10.1 理解字典概念

### 10.1.1 全局状态管理

全局字典提供了一种集中式的状态管理方案：

```typescript
// 传统的全局状态管理问题
let globalConfig = {
  maxUsers: 1000,
  maintenanceMode: false,
  currentTheme: 'light'
};

// 问题：状态变化时需要手动通知所有依赖者
function updateConfig(key: string, value: any) {
  globalConfig[key] = value;
  // 需要手动通知所有依赖的组件 ❌
  notifyAllComponents();
}

// 使用字典的响应式方案
const maxUsersDict = Dictionary.create({
  name: 'maxUsers',
  type: 'number',
  collection: false
});

const maintenanceModeDict = Dictionary.create({
  name: 'maintenanceMode',
  type: 'boolean',
  collection: false
});

// ✅ 当字典值变化时，所有依赖的计算会自动更新
```

### 10.1.2 字典 vs 实体

字典和实体的主要区别：

| 特性 | 字典 (Dictionary) | 实体 (Entity) |
|------|------------------|---------------|
| **作用域** | 全局唯一 | 可以有多个实例 |
| **存储位置** | `state` 表 | 专门的实体表 |
| **标识方式** | 通过名称 | 通过 ID |
| **关系支持** | 不支持关系 | 支持复杂关系 |
| **用途** | 全局配置、统计 | 业务数据 |

```typescript
// 字典：全局唯一的配置
const systemConfig = Dictionary.create({
  name: 'systemConfig',
  type: 'object',
  collection: false
});

// 实体：可以有多个用户实例
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'})
  ]
});
```

### 10.1.3 使用场景

全局字典适用于以下场景：

- **系统配置**：应用设置、功能开关
- **全局统计**：用户总数、销售总额
- **缓存数据**：频繁访问的计算结果
- **状态标志**：维护模式、系统状态
- **外部数据**：第三方 API 数据的本地缓存

## 10.2 定义字典

### 10.2.1 基本字典定义

```typescript
import { Dictionary } from '@interaqt/runtime';

// 定义系统配置字典
const systemConfig = Dictionary.create({
  name: 'systemConfig',        // 字典名称，全局唯一
  type: 'object',              // 数据类型
  collection: false,           // 是否为集合类型
  args: {                      // 类型参数（可选）
    maxLength: 1000
  }
});

// 定义用户总数统计
const totalUsers = Dictionary.create({
  name: 'totalUsers',
  type: 'number',
  collection: false
});

// 定义标签列表
const systemTags = Dictionary.create({
  name: 'systemTags',
  type: 'string',
  collection: true             // 集合类型，存储字符串数组
});
```

### 10.2.2 支持的数据类型

```typescript
// 字符串类型
const appName = Dictionary.create({
  name: 'appName',
  type: 'string',
  collection: false
});

// 数字类型
const version = Dictionary.create({
  name: 'version',
  type: 'number',
  collection: false
});

// 布尔类型
const isMaintenanceMode = Dictionary.create({
  name: 'isMaintenanceMode',
  type: 'boolean',
  collection: false
});

// 对象类型
const appSettings = Dictionary.create({
  name: 'appSettings',
  type: 'object',
  collection: false
});

// 集合类型
const supportedLanguages = Dictionary.create({
  name: 'supportedLanguages',
  type: 'string',
  collection: true
});

const dailyStats = Dictionary.create({
  name: 'dailyStats',
  type: 'object',
  collection: true
});
```

### 10.2.3 字典命名规范

```typescript
// ✅ 好的命名示例
const userCount = Dictionary.create({
  name: 'userCount',           // 驼峰命名
  type: 'number',
  collection: false
});

const systemConfig = Dictionary.create({
  name: 'sysConfig',           // 简洁明了
  type: 'object',
  collection: false
});

// ❌ 避免的命名方式
const dict1 = Dictionary.create({
  name: 'dict1',               // 名称不明确
  type: 'string',
  collection: false
});

const user_total_count = Dictionary.create({
  name: 'user_total_count',    // 使用下划线（不推荐）
  type: 'number',
  collection: false
});
```

## 10.3 字典的响应式计算

### 10.3.1 基于实体的全局统计

```typescript
// 创建用户实体
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'email', type: 'string'}),
    Property.create({name: 'isActive', type: 'boolean'})
  ]
});

// 创建用户总数统计字典
const totalUsers = Dictionary.create({
  name: 'totalUsers',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: userEntity
  })
});

// 创建活跃用户数统计字典
const activeUsers = Dictionary.create({
  name: 'activeUsers',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: userEntity
  })
});

// 使用示例
const controller = new Controller(
  system,
  [userEntity],           // 实体
  [],                     // 关系
  [],                     // 交互
  [],                     // 活动
  [totalUsers, activeUsers], // 字典
  []                      // 活动组
);

await controller.setup(true);

// 创建用户时，统计会自动更新
await system.storage.create('User', {
  username: 'alice',
  email: 'alice@example.com',
  isActive: true
});

// 获取统计结果
const total = await system.storage.get('state', 'totalUsers');
const active = await system.storage.get('state', 'activeUsers');
console.log(`Total users: ${total}, Active users: ${active}`);
```

### 10.3.2 基于关系的全局统计

```typescript
// 创建好友关系
const friendRelation = Relation.create({
  name: 'Friend',
  source: userEntity,
  sourceProperty: 'friends',
  target: userEntity,
  targetProperty: 'friendOf',
  type: 'n:n',
  properties: [
    Property.create({name: 'since', type: 'string'}),
    Property.create({name: 'closeness', type: 'number'})
  ]
});

// 统计好友关系总数
const totalFriendships = Dictionary.create({
  name: 'totalFriendships',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: friendRelation
  })
});

// 统计亲密好友数量（closeness > 8）
const closeFriendships = Dictionary.create({
  name: 'closeFriendships',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: friendRelation
  })
});

// 计算平均亲密度
const averageCloseness = Dictionary.create({
  name: 'averageCloseness',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: WeightedSummation.create({
    record: friendRelation,
    attributeQuery: ['closeness'],
    callback: (friendship: any) => ({
      weight: 1,
      value: friendship.closeness || 0
    })
  })
});
```

### 10.3.3 基于交互的全局计数

```typescript
// 创建登录交互
const loginInteraction = Interaction.create({
  name: 'login',
  action: Action.create({name: 'login'}),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'user',
        base: userEntity,
        isRef: true
      })
    ]
  })
});

// 统计登录次数
const totalLogins = Dictionary.create({
  name: 'totalLogins',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: InteractionEventEntity
  })
});

// 统计今日登录次数
const todayLogins = Dictionary.create({
  name: 'todayLogins',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computedData: Count.create({
    record: InteractionEventEntity
  })
});
```

### 10.3.4 复杂的全局计算

```typescript
// 创建订单实体
const orderEntity = Entity.create({
  name: 'Order',
  properties: [
    Property.create({name: 'amount', type: 'number'}),
    Property.create({name: 'status', type: 'string'}),
    Property.create({name: 'createdAt', type: 'string'})
  ]
});

// 使用 Transform 进行复杂的全局统计
const salesSummary = Dictionary.create({
  name: 'salesSummary',
  type: 'object',
  collection: false,
  defaultValue: () => ({}),
  computedData: Transform.create({
    record: orderEntity,
    attributeQuery: ['amount', 'status', 'createdAt'],
    callback: (orders: any[]) => {
      const completed = orders.filter(order => order.status === 'completed');
      const pending = orders.filter(order => order.status === 'pending');
      
      const totalRevenue = completed.reduce((sum, order) => sum + order.amount, 0);
      const averageOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;
      
      // 计算月度统计
      const monthlyStats = {};
      completed.forEach(order => {
        const month = new Date(order.createdAt).toISOString().slice(0, 7); // YYYY-MM
        if (!monthlyStats[month]) {
          monthlyStats[month] = { count: 0, revenue: 0 };
        }
        monthlyStats[month].count++;
        monthlyStats[month].revenue += order.amount;
      });
      
      return {
        totalOrders: orders.length,
        completedOrders: completed.length,
        pendingOrders: pending.length,
        totalRevenue,
        averageOrderValue,
        monthlyStats,
        lastUpdated: new Date().toISOString()
      };
    }
  })
});
```

## 10.4 在业务中使用字典

### 10.4.1 读取字典值

```typescript
// 基本读取
const userCount = await system.storage.get('state', 'totalUsers');
console.log(`Current user count: ${userCount}`);

// 读取对象类型字典
const salesSummary = await system.storage.get('state', 'salesSummary');
console.log(`Total revenue: ${salesSummary.totalRevenue}`);
console.log(`Average order value: ${salesSummary.averageOrderValue}`);

// 读取集合类型字典
const supportedLanguages = await system.storage.get('state', 'supportedLanguages');
console.log(`Supported languages: ${supportedLanguages.join(', ')}`);

// 批量读取多个字典值
async function getSystemStatus() {
  const [userCount, activeUsers, maintenanceMode] = await Promise.all([
    system.storage.get('state', 'totalUsers'),
    system.storage.get('state', 'activeUsers'),
    system.storage.get('state', 'maintenanceMode')
  ]);
  
  return {
    userCount,
    activeUsers,
    maintenanceMode,
    timestamp: Date.now()
  };
}
```

### 10.4.2 设置字典值

```typescript
// 设置简单值
await system.storage.set('state', 'maxUsers', 5000);
await system.storage.set('state', 'maintenanceMode', true);

// 设置对象值
await system.storage.set('state', 'systemConfig', {
  theme: 'dark',
  language: 'zh-CN',
  notifications: true,
  maxFileSize: 10 * 1024 * 1024 // 10MB
});

// 设置集合值
await system.storage.set('state', 'supportedLanguages', [
  'zh-CN', 'en-US', 'ja-JP', 'ko-KR'
]);

// 条件设置（仅在不存在时设置）
async function setDefaultConfig() {
  const existingConfig = await system.storage.get('state', 'systemConfig');
  if (!existingConfig) {
    await system.storage.set('state', 'systemConfig', {
      theme: 'light',
      language: 'en-US',
      notifications: false
    });
  }
}
```

### 10.4.3 基于字典的条件判断

```typescript
// 在交互中使用字典值进行条件判断
const createUserInteraction = Interaction.create({
  name: 'createUser',
  action: Action.create({name: 'createUser'}),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userData',
        base: userEntity
      })
    ]
  })
});

// 使用 Attributive 基于字典值控制权限
const MaxUsersReachedAttributive = Attributive.create({
  name: 'MaxUsersNotReached',
  content: async function(context: any) {
    const currentUserCount = await context.system.storage.get('state', 'totalUsers');
    const maxUsers = await context.system.storage.get('state', 'maxUsers');
    return currentUserCount < maxUsers;
  }
});

// 为交互添加基于字典的权限控制
createUserInteraction.attributives = [MaxUsersReachedAttributive];
```

### 10.4.4 字典与计算的结合

```typescript
// 创建一个依赖全局字典的属性计算
const UserScoreComputed = createClass({
  name: 'UserScoreComputed',
  public: {
    baseScore: {
      type: 'number',
      required: false
    }
  }
});

class UserScoreComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof UserScoreComputed>, 
    public dataContext: PropertyDataContext
  ) {
    // 依赖全局配置字典
    this.dataDeps = {
      globalConfig: {
        type: 'global',
        source: Dictionary.create({
          name: 'scoringConfig',
          type: 'object',
          collection: false
        })
      }
    }
  }
  
  async compute(deps: {globalConfig: any}, context: any) {
    const baseScore = this.args.baseScore || 0;
    const config = deps.globalConfig || {};
    
    // 根据全局配置计算用户分数
    const multiplier = config.scoreMultiplier || 1;
    const bonus = config.newUserBonus || 0;
    
    return (baseScore * multiplier) + bonus;
  }
}

// 注册计算处理器
ComputedDataHandle.Handles.set(UserScoreComputed, {
  property: UserScoreComputation
});

// 在用户实体中使用
userEntity.properties.push(
  Property.create({
    name: 'score',
    type: 'number',
    computedData: UserScoreComputed.create({
      baseScore: 100
    })
  })
);

// 创建评分配置字典
const scoringConfig = Dictionary.create({
  name: 'scoringConfig',
  type: 'object',
  collection: false
});

// 设置配置值
await system.storage.set('state', 'scoringConfig', {
  scoreMultiplier: 1.5,
  newUserBonus: 50
});
```

## 10.5 字典的高级用法

### 10.5.1 动态配置管理

```typescript
// 创建功能开关字典
const featureFlags = Dictionary.create({
  name: 'featureFlags',
  type: 'object',
  collection: false
});

// 设置功能开关
await system.storage.set('state', 'featureFlags', {
  enableNewUI: true,
  enableBetaFeatures: false,
  enableAnalytics: true,
  maxUploadSize: 50 * 1024 * 1024 // 50MB
});

// 创建配置管理工具类
class ConfigManager {
  constructor(private system: MonoSystem) {}
  
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    const flags = await this.system.storage.get('state', 'featureFlags');
    return flags?.[featureName] === true;
  }
  
  async getFeatureConfig(featureName: string): Promise<any> {
    const flags = await this.system.storage.get('state', 'featureFlags');
    return flags?.[featureName];
  }
  
  async enableFeature(featureName: string): Promise<void> {
    const flags = await this.system.storage.get('state', 'featureFlags') || {};
    flags[featureName] = true;
    await this.system.storage.set('state', 'featureFlags', flags);
  }
  
  async disableFeature(featureName: string): Promise<void> {
    const flags = await this.system.storage.get('state', 'featureFlags') || {};
    flags[featureName] = false;
    await this.system.storage.set('state', 'featureFlags', flags);
  }
  
  async updateFeatureConfig(featureName: string, config: any): Promise<void> {
    const flags = await this.system.storage.get('state', 'featureFlags') || {};
    flags[featureName] = config;
    await this.system.storage.set('state', 'featureFlags', flags);
  }
}

// 使用配置管理器
const configManager = new ConfigManager(system);

// 检查功能是否启用
if (await configManager.isFeatureEnabled('enableNewUI')) {
  console.log('New UI is enabled');
}

// 获取上传大小限制
const maxUploadSize = await configManager.getFeatureConfig('maxUploadSize');
console.log(`Max upload size: ${maxUploadSize} bytes`);
```

### 10.5.2 缓存机制

```typescript
// 创建缓存字典
const apiCache = Dictionary.create({
  name: 'apiCache',
  type: 'object',
  collection: false
});

// 缓存管理器
class CacheManager {
  constructor(private system: MonoSystem, private ttl: number = 3600000) {} // 默认1小时TTL
  
  async get(key: string): Promise<any> {
    const cache = await this.system.storage.get('state', 'apiCache') || {};
    const item = cache[key];
    
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      await this.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  async set(key: string, data: any): Promise<void> {
    const cache = await this.system.storage.get('state', 'apiCache') || {};
    cache[key] = {
      data,
      timestamp: Date.now()
    };
    await this.system.storage.set('state', 'apiCache', cache);
  }
  
  async delete(key: string): Promise<void> {
    const cache = await this.system.storage.get('state', 'apiCache') || {};
    delete cache[key];
    await this.system.storage.set('state', 'apiCache', cache);
  }
  
  async clear(): Promise<void> {
    await this.system.storage.set('state', 'apiCache', {});
  }
  
  async cleanup(): Promise<void> {
    const cache = await this.system.storage.get('state', 'apiCache') || {};
    const now = Date.now();
    
    Object.keys(cache).forEach(key => {
      if (now - cache[key].timestamp > this.ttl) {
        delete cache[key];
      }
    });
    
    await this.system.storage.set('state', 'apiCache', cache);
  }
}

// 使用缓存管理器
const cacheManager = new CacheManager(system, 1800000); // 30分钟TTL

// 缓存 API 响应
async function fetchUserProfile(userId: string) {
  const cacheKey = `user_profile_${userId}`;
  
  // 尝试从缓存获取
  let profile = await cacheManager.get(cacheKey);
  if (profile) {
    console.log('Cache hit');
    return profile;
  }
  
  // 缓存未命中，调用 API
  console.log('Cache miss, fetching from API');
  profile = await callExternalAPI(`/users/${userId}`);
  
  // 存入缓存
  await cacheManager.set(cacheKey, profile);
  
  return profile;
}
```

### 10.5.3 实时统计仪表板

```typescript
// 创建实时统计字典
const realtimeStats = Dictionary.create({
  name: 'realtimeStats',
  type: 'object',
  collection: false,
  computedData: Transform.create({
    record: userEntity,
    attributeQuery: ['isActive', 'createdAt', 'lastLoginAt'],
    callback: (users: any[]) => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;
      const oneWeekAgo = now - 604800000;
      
      const activeUsers = users.filter(user => user.isActive);
      const recentLogins = users.filter(user => 
        user.lastLoginAt && new Date(user.lastLoginAt).getTime() > oneHourAgo
      );
      const newUsersToday = users.filter(user => 
        new Date(user.createdAt).getTime() > oneDayAgo
      );
      const newUsersThisWeek = users.filter(user => 
        new Date(user.createdAt).getTime() > oneWeekAgo
      );
      
      return {
        totalUsers: users.length,
        activeUsers: activeUsers.length,
        inactiveUsers: users.length - activeUsers.length,
        recentLogins: recentLogins.length,
        newUsersToday: newUsersToday.length,
        newUsersThisWeek: newUsersThisWeek.length,
        userGrowthRate: newUsersThisWeek.length / Math.max(users.length - newUsersThisWeek.length, 1),
        timestamp: now
      };
    }
  })
});

// 仪表板数据获取器
class Dashboard {
  constructor(private system: MonoSystem) {}
  
  async getRealtimeStats() {
    return await this.system.storage.get('state', 'realtimeStats');
  }
  
  async getSystemHealth() {
    const [stats, config, cache] = await Promise.all([
      this.system.storage.get('state', 'realtimeStats'),
      this.system.storage.get('state', 'systemConfig'),
      this.system.storage.get('state', 'apiCache')
    ]);
    
    return {
      userStats: stats,
      systemConfig: config,
      cacheSize: Object.keys(cache || {}).length,
      lastUpdated: Date.now()
    };
  }
  
  async getPerformanceMetrics() {
    const stats = await this.getRealtimeStats();
    const cacheHitRate = await this.calculateCacheHitRate();
    
    return {
      userEngagement: stats.recentLogins / stats.activeUsers,
      growthRate: stats.userGrowthRate,
      cacheHitRate,
      systemLoad: await this.getSystemLoad()
    };
  }
  
  private async calculateCacheHitRate(): Promise<number> {
    // 这里可以实现缓存命中率的计算逻辑
    return 0.85; // 示例值
  }
  
  private async getSystemLoad(): Promise<number> {
    // 这里可以实现系统负载的计算逻辑
    return 0.3; // 示例值
  }
}
```

## 10.6 最佳实践

### 10.6.1 命名和组织

```typescript
// ✅ 按功能分组命名
const userStats = Dictionary.create({
  name: 'userStats',
  type: 'object',
  collection: false
});

const systemConfig = Dictionary.create({
  name: 'systemConfig',
  type: 'object',
  collection: false
});

const featureFlags = Dictionary.create({
  name: 'featureFlags',
  type: 'object',
  collection: false
});

// ✅ 使用常量管理字典名称
const DICT_NAMES = {
  USER_STATS: 'userStats',
  SYSTEM_CONFIG: 'systemConfig',
  FEATURE_FLAGS: 'featureFlags',
  API_CACHE: 'apiCache'
} as const;

// 使用常量
const userStatsValue = await system.storage.get('state', DICT_NAMES.USER_STATS);
```

### 10.6.2 类型安全

```typescript
// 定义字典值的类型
interface SystemConfig {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  maxFileSize: number;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  lastUpdated: number;
}

// 创建类型安全的字典访问器
class TypedDictionary {
  constructor(private system: MonoSystem) {}
  
  async getSystemConfig(): Promise<SystemConfig | null> {
    return await this.system.storage.get('state', 'systemConfig');
  }
  
  async setSystemConfig(config: SystemConfig): Promise<void> {
    await this.system.storage.set('state', 'systemConfig', config);
  }
  
  async getUserStats(): Promise<UserStats | null> {
    return await this.system.storage.get('state', 'userStats');
  }
  
  async updateSystemConfig(updates: Partial<SystemConfig>): Promise<void> {
    const current = await this.getSystemConfig() || {} as SystemConfig;
    const updated = { ...current, ...updates };
    await this.setSystemConfig(updated);
  }
}
```

### 10.6.3 性能优化

```typescript
// 批量读取字典值
class DictionaryBatch {
  constructor(private system: MonoSystem) {}
  
  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    const promises = keys.map(key => 
      this.system.storage.get('state', key).then(value => [key, value])
    );
    
    const results = await Promise.all(promises);
    return Object.fromEntries(results);
  }
  
  async setMultiple(updates: Record<string, any>): Promise<void> {
    const promises = Object.entries(updates).map(([key, value]) =>
      this.system.storage.set('state', key, value)
    );
    
    await Promise.all(promises);
  }
}

// 使用示例
const batch = new DictionaryBatch(system);

// 批量读取
const configs = await batch.getMultiple([
  'systemConfig',
  'featureFlags',
  'userStats'
]);

// 批量更新
await batch.setMultiple({
  'systemConfig': { theme: 'dark' },
  'featureFlags': { enableNewUI: true },
  'lastUpdated': Date.now()
});
```

全局字典为 @interaqt/runtime 框架提供了强大的全局状态管理能力。通过合理使用字典，可以实现系统配置管理、实时统计、缓存机制等功能，为构建复杂的响应式应用提供了坚实的基础。