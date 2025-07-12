# 10. How to Use Global Dictionaries

Global dictionaries are an important mechanism in the interaqt framework for managing global state and configuration. They provide a declarative way to define and maintain system-level data that can be referenced and reacted to by other components throughout the application.

## 10.1 Understanding Dictionary Concepts

### 10.1.1 Global State Management

Global dictionaries provide a centralized state management solution:

```typescript
// Traditional global state management problems
let globalConfig = {
  maxUsers: 1000,
  maintenanceMode: false,
  currentTheme: 'light'
};

// Problem: Need to manually notify all dependents when state changes
function updateConfig(key: string, value: any) {
  globalConfig[key] = value;
  // Need to manually notify all dependent components ❌
  notifyAllComponents();
}

// Reactive solution using dictionaries
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

// ✅ When dictionary values change, all dependent computations automatically update
```

### 10.1.2 Dictionary vs Entity

Main differences between dictionaries and entities:

| Feature | Dictionary | Entity |
|---------|------------|--------|
| **Scope** | Globally unique | Can have multiple instances |
| **Storage Location** | `state` table | Dedicated entity table |
| **Identification** | By name | By ID |
| **Relationship Support** | No relationships | Supports complex relationships |
| **Purpose** | Global config, statistics | Business data |

```typescript
// Dictionary: Globally unique configuration
const systemConfig = Dictionary.create({
  name: 'systemConfig',
  type: 'object',
  collection: false
});

// Entity: Can have multiple user instances
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'})
  ]
});
```

### 10.1.3 Use Cases

Global dictionaries are suitable for:

- **System Configuration**: Application settings, feature flags
- **Global Statistics**: Total users, total sales
- **Cached Data**: Frequently accessed computation results
- **Status Flags**: Maintenance mode, system status
- **External Data**: Local cache of third-party API data

## 10.2 Defining Dictionaries

### 10.2.1 Basic Dictionary Definition

```typescript
import { Dictionary } from 'interaqt';

// Define system configuration dictionary
const systemConfig = Dictionary.create({
  name: 'systemConfig',        // Dictionary name, globally unique
  type: 'object',              // Data type
  collection: false,           // Whether it's a collection type
  args: {                      // Type parameters (optional)
    maxLength: 1000
  }
});

// Define total user count statistics
const totalUsers = Dictionary.create({
  name: 'totalUsers',
  type: 'number',
  collection: false
});

// Define system tags list
const systemTags = Dictionary.create({
  name: 'systemTags',
  type: 'string',
  collection: true             // Collection type, stores string array
});
```

### 10.2.2 Supported Data Types

```typescript
// String type
const appName = Dictionary.create({
  name: 'appName',
  type: 'string',
  collection: false
});

// Number type
const version = Dictionary.create({
  name: 'version',
  type: 'number',
  collection: false
});

// Boolean type
const isMaintenanceMode = Dictionary.create({
  name: 'isMaintenanceMode',
  type: 'boolean',
  collection: false
});

// Object type
const appSettings = Dictionary.create({
  name: 'appSettings',
  type: 'object',
  collection: false
});

// Collection type
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

### 10.2.3 Dictionary Naming Conventions

```typescript
// ✅ Good naming examples
const userCount = Dictionary.create({
  name: 'userCount',           // Camel case
  type: 'number',
  collection: false
});

const systemConfig = Dictionary.create({
  name: 'sysConfig',           // Concise and clear
  type: 'object',
  collection: false
});

// ❌ Naming patterns to avoid
const dict1 = Dictionary.create({
  name: 'dict1',               // Unclear name
  type: 'string',
  collection: false
});

const user_total_count = Dictionary.create({
  name: 'user_total_count',    // Using underscores (not recommended)
  type: 'number',
  collection: false
});
```

## 10.3 Reactive Computations with Dictionaries

### 10.3.1 Global Statistics Based on Entities

```typescript
// Create user entity
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({name: 'username', type: 'string'}),
    Property.create({name: 'email', type: 'string'}),
    Property.create({name: 'isActive', type: 'boolean'})
  ]
});

// Create total user count statistics dictionary
const totalUsers = Dictionary.create({
  name: 'totalUsers',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: userEntity
  })
});

// Create active user count statistics dictionary
const activeUsers = Dictionary.create({
  name: 'activeUsers',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: userEntity
  })
});

// Usage example
const controller = new Controller({
  system,
  entities: [userEntity],           // Entities
  relations: [],                    // Relations
  activities: [],                   // Activities
  interactions: [],                 // Interactions
  dict: [totalUsers, activeUsers],  // Dictionaries
  recordMutationSideEffects: []     // recordMutationSideEffects
});

await controller.setup(true);

// When creating users, statistics automatically update
await system.storage.create('User', {
  username: 'alice',
  email: 'alice@example.com',
  isActive: true
});

// Get statistics results
const total = await system.storage.get('state', 'totalUsers');
const active = await system.storage.get('state', 'activeUsers');
console.log(`Total users: ${total}, Active users: ${active}`);
```

### 10.3.2 Global Statistics Based on Relations

```typescript
// Create friend relation
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

// Count total friendships
const totalFriendships = Dictionary.create({
  name: 'totalFriendships',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: friendRelation
  })
});

// Count close friendships (closeness > 8)
const closeFriendships = Dictionary.create({
  name: 'closeFriendships',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: friendRelation
  })
});

// Calculate average closeness
const averageCloseness = Dictionary.create({
  name: 'averageCloseness',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: WeightedSummation.create({
    record: friendRelation,
    attributeQuery: ['closeness'],
    callback: (friendship: any) => ({
      weight: 1,
      value: friendship.closeness || 0
    })
  })
});
```

### 10.3.3 Global Counting Based on Interactions

```typescript
// Create login interaction
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

// Count total logins
const totalLogins = Dictionary.create({
  name: 'totalLogins',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: InteractionEventEntity
  })
});

// Count today's logins
const todayLogins = Dictionary.create({
  name: 'todayLogins',
  type: 'number',
  collection: false,
  defaultValue: () => 0,
  computation: Count.create({
    record: InteractionEventEntity
  })
});
```

### 10.3.4 Complex Global Computations

```typescript
// Create order entity
const orderEntity = Entity.create({
  name: 'Order',
  properties: [
    Property.create({name: 'amount', type: 'number'}),
    Property.create({name: 'status', type: 'string'}),
    Property.create({name: 'createdAt', type: 'string'})
  ]
});

// Use Transform for complex global statistics
const salesSummary = Dictionary.create({
  name: 'salesSummary',
  type: 'object',
  collection: false,
  defaultValue: () => ({}),
  computation: Transform.create({
    record: orderEntity,
    attributeQuery: ['amount', 'status', 'createdAt'],
    callback: (orders: any[]) => {
      const completed = orders.filter(order => order.status === 'completed');
      const pending = orders.filter(order => order.status === 'pending');
      
      const totalRevenue = completed.reduce((sum, order) => sum + order.amount, 0);
      const averageOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;
      
      // Calculate monthly statistics
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

## 10.4 Using Dictionaries in Business Logic

### 10.4.1 Reading Dictionary Values

```typescript
// Basic reading
const userCount = await system.storage.get('state', 'totalUsers');
console.log(`Current user count: ${userCount}`);

// Reading object type dictionary
const salesSummary = await system.storage.get('state', 'salesSummary');
console.log(`Total revenue: ${salesSummary.totalRevenue}`);
console.log(`Average order value: ${salesSummary.averageOrderValue}`);

// Reading collection type dictionary
const supportedLanguages = await system.storage.get('state', 'supportedLanguages');
console.log(`Supported languages: ${supportedLanguages.join(', ')}`);

// Batch reading multiple dictionary values
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

### 10.4.2 Setting Dictionary Values

```typescript
// Set simple values
await system.storage.set('state', 'maxUsers', 5000);
await system.storage.set('state', 'maintenanceMode', true);

// Set object values
await system.storage.set('state', 'systemConfig', {
  theme: 'dark',
  language: 'zh-CN',
  notifications: true,
  maxFileSize: 10 * 1024 * 1024 // 10MB
});

// Set collection values
await system.storage.set('state', 'supportedLanguages', [
  'zh-CN', 'en-US', 'ja-JP', 'ko-KR'
]);

// Conditional setting (only set if doesn't exist)
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

### 10.4.3 Conditional Logic Based on Dictionaries

```typescript
// Using dictionary values for conditional logic in interactions
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

// Use Attributive to control permissions based on dictionary values
const MaxUsersReachedAttributive = Attributive.create({
  name: 'MaxUsersNotReached',
  content: async function(context: any) {
    const currentUserCount = await context.system.storage.get('state', 'totalUsers');
    const maxUsers = await context.system.storage.get('state', 'maxUsers');
    return currentUserCount < maxUsers;
  }
});

// Add dictionary-based permission control to interaction
createUserInteraction.attributives = [MaxUsersReachedAttributive];
```

### 10.4.4 Combining Dictionaries with Computations

```typescript
// Create a property computation that depends on global dictionaries
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
  static computationType = UserScoreComputed
  static contextType = 'property' as const
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof UserScoreComputed>, 
    public dataContext: PropertyDataContext
  ) {
    // Depend on global configuration dictionary
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
    
    // Calculate user score based on global configuration
    const multiplier = config.scoreMultiplier || 1;
    const bonus = config.newUserBonus || 0;
    
    return (baseScore * multiplier) + bonus;
  }
}

// Export computation handler
export const UserScoreHandles = [UserScoreComputation];

// Use in user entity
userEntity.properties.push(
  Property.create({
    name: 'score',
    type: 'number',
    computation: UserScoreComputed.create({
      baseScore: 100
    })
  })
);

// Create scoring configuration dictionary
const scoringConfig = Dictionary.create({
  name: 'scoringConfig',
  type: 'object',
  collection: false
});

// Set configuration values
await system.storage.set('state', 'scoringConfig', {
  scoreMultiplier: 1.5,
  newUserBonus: 50
});
```

## 10.5 Advanced Dictionary Usage

### 10.5.1 Dynamic Configuration Management

```typescript
// Create feature flags dictionary
const featureFlags = Dictionary.create({
  name: 'featureFlags',
  type: 'object',
  collection: false
});

// Set feature flags
await system.storage.set('state', 'featureFlags', {
  enableNewUI: true,
  enableBetaFeatures: false,
  enableAnalytics: true,
  maxUploadSize: 50 * 1024 * 1024 // 50MB
});

// Create configuration management utility class
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

// Use configuration manager
const configManager = new ConfigManager(system);

// Check if feature is enabled
if (await configManager.isFeatureEnabled('enableNewUI')) {
  console.log('New UI is enabled');
}

// Get upload size limit
const maxUploadSize = await configManager.getFeatureConfig('maxUploadSize');
console.log(`Max upload size: ${maxUploadSize} bytes`);
```

### 10.5.2 Caching Mechanism

```typescript
// Create cache dictionary
const apiCache = Dictionary.create({
  name: 'apiCache',
  type: 'object',
  collection: false
});

// Cache manager
class CacheManager {
  constructor(private system: MonoSystem, private ttl: number = 3600000) {} // Default 1 hour TTL
  
  async get(key: string): Promise<any> {
    const cache = await this.system.storage.get('state', 'apiCache') || {};
    const item = cache[key];
    
    if (!item) return null;
    
    // Check if expired
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

// Use cache manager
const cacheManager = new CacheManager(system, 1800000); // 30-minute TTL

// Cache API responses
async function fetchUserProfile(userId: string) {
  const cacheKey = `user_profile_${userId}`;
  
  // Try to get from cache
  let profile = await cacheManager.get(cacheKey);
  if (profile) {
    console.log('Cache hit');
    return profile;
  }
  
  // Cache miss, call API
  console.log('Cache miss, fetching from API');
  profile = await callExternalAPI(`/users/${userId}`);
  
  // Store in cache
  await cacheManager.set(cacheKey, profile);
  
  return profile;
}
```

### 10.5.3 Real-time Statistics Dashboard

```typescript
// Create real-time statistics dictionary
const realtimeStats = Dictionary.create({
  name: 'realtimeStats',
  type: 'object',
  collection: false,
  computation: Transform.create({
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

// Dashboard data accessor
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
    // Cache hit rate calculation logic can be implemented here
    return 0.85; // Example value
  }
  
  private async getSystemLoad(): Promise<number> {
    // System load calculation logic can be implemented here
    return 0.3; // Example value
  }
}
```

## 10.6 Best Practices

### 10.6.1 Naming and Organization

```typescript
// ✅ Good naming examples grouped by function
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

// ✅ Use constants to manage dictionary names
const DICT_NAMES = {
  USER_STATS: 'userStats',
  SYSTEM_CONFIG: 'systemConfig',
  FEATURE_FLAGS: 'featureFlags',
  API_CACHE: 'apiCache'
} as const;

// Use constants
const userStatsValue = await system.storage.get('state', DICT_NAMES.USER_STATS);
```

### 10.6.2 Type Safety

```typescript
// Define dictionary value types
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

// Create type-safe dictionary accessor
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

### 10.6.3 Performance Optimization

```typescript
// Batch reading dictionary values
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

// Usage example
const batch = new DictionaryBatch(system);

// Batch reading
const configs = await batch.getMultiple([
  'systemConfig',
  'featureFlags',
  'userStats'
]);

// Batch updating
await batch.setMultiple({
  'systemConfig': { theme: 'dark' },
  'featureFlags': { enableNewUI: true },
  'lastUpdated': Date.now()
});
```

Global dictionaries provide the interaqt framework with powerful global state management capabilities. Through proper use of dictionaries, you can implement system configuration management, real-time statistics, caching mechanisms, and other features, providing a solid foundation for building complex reactive applications.
