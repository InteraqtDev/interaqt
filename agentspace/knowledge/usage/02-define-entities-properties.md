# 如何定义实体和属性

## 创建基本实体

实体（Entity）是系统中数据的基本单位。使用 `Entity.create()` 方法创建实体：

```javascript
import { Entity, Property } from '@interaqt/runtime';

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'age', type: 'number' })
  ]
});
```

### 实体命名规范

- 使用 PascalCase（首字母大写的驼峰命名）
- 名称应该是单数形式（User 而不是 Users）
- 名称应该具有描述性，清楚表达实体的含义

```javascript
// ✅ 好的命名
const User = Entity.create({ name: 'User' });
const BlogPost = Entity.create({ name: 'BlogPost' });
const OrderItem = Entity.create({ name: 'OrderItem' });

// ❌ 避免的命名
const users = Entity.create({ name: 'users' });
const data = Entity.create({ name: 'data' });
const obj = Entity.create({ name: 'obj' });
```

## 定义属性类型

### 基本类型

框架支持多种基本数据类型：

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean' }),
    Property.create({ name: 'createdAt', type: 'string' }) // 可以存储 ISO 日期字符串
  ]
});
```

### JSON 类型

对于复杂的数据结构，可以使用 JSON 类型：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'profile', 
      type: 'object',  // JSON 对象
      collection: false 
    }),
    Property.create({ 
      name: 'tags', 
      type: 'string',
      collection: true  // 字符串数组
    })
  ]
});

// 使用示例
const userData = {
  name: 'John Doe',
  profile: {
    bio: 'Software developer',
    location: 'San Francisco',
    skills: ['JavaScript', 'TypeScript', 'React']
  },
  tags: ['developer', 'javascript', 'react']
};
```

### 自定义类型

你可以定义自定义的复杂类型：

```javascript
// 定义地址类型
const Address = {
  street: 'string',
  city: 'string',
  country: 'string',
  zipCode: 'string'
};

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'address', 
      type: 'object',
      collection: false
    })
  ]
});
```

## 设置默认值

### 静态默认值

为属性设置固定的默认值：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'active'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: 0
    }),
    Property.create({ 
      name: 'isVerified', 
      type: 'boolean',
      defaultValue: false
    })
  ]
});
```

### 动态默认值（函数）

使用函数生成动态默认值：

```javascript
const Order = Entity.create({
  name: 'Order',
  properties: [
    Property.create({ 
      name: 'orderNumber', 
      type: 'string',
      defaultValue: () => `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'pending'
    })
  ]
});
```

### 基于其他字段的默认值

可以基于同一记录的其他字段来设置默认值：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    Property.create({ 
      name: 'displayName', 
      type: 'string',
      defaultValue: (record) => `${record.firstName} ${record.lastName}`
    }),
    Property.create({ 
      name: 'email', 
      type: 'string'
    }),
    Property.create({ 
      name: 'username', 
      type: 'string',
      defaultValue: (record) => record.email.split('@')[0]
    })
  ]
});
```

## 使用计算属性

计算属性是框架的核心特性之一，它们的值会根据其他数据的变化自动更新。

### getValue 函数

使用 `getValue` 函数定义简单的计算属性：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'firstName', type: 'string' }),
    Property.create({ name: 'lastName', type: 'string' }),
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    })
  ]
});
```

### 基于当前记录的计算

计算属性可以访问当前记录的所有字段：

```javascript
const Product = Entity.create({
  name: 'Product',
  properties: [
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'taxRate', type: 'number', defaultValue: 0.1 }),
    Property.create({
      name: 'totalPrice',
      type: 'number',
      getValue: (record) => record.price * (1 + record.taxRate)
    }),
    Property.create({
      name: 'priceCategory',
      type: 'string',
      getValue: (record) => {
        if (record.price < 100) return 'budget';
        if (record.price < 500) return 'mid-range';
        return 'premium';
      }
    })
  ]
});
```

### 计算属性的持久化

默认情况下，计算属性不会存储在数据库中，而是在查询时动态计算。如果需要持久化计算结果（例如为了性能优化），可以使用响应式计算：

```javascript
import { Count } from '@interaqt/runtime';

const Post = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' }),
    Property.create({ name: 'content', type: 'string' }),
    Property.create({
      name: 'likeCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: Like  // 这会持久化到数据库
      })
    })
  ]
});
```

## 属性配置选项

### 必填字段

设置字段为必填：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'email', 
      type: 'string',
      required: true  // 必填字段
    }),
    Property.create({ 
      name: 'name', 
      type: 'string',
      required: true
    }),
    Property.create({ 
      name: 'bio', 
      type: 'string',
      required: false  // 可选字段（默认）
    })
  ]
});
```

### 约束和验证

框架本身不提供字段级别的唯一约束和索引配置。这些应该在数据库层面或通过业务逻辑来实现：

```javascript
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'email', 
      type: 'string'
      // 唯一性通过业务逻辑或数据库约束保证
    }),
    Property.create({ 
      name: 'username', 
      type: 'string'
      // 同上
    })
  ]
});
```

如果需要在应用层面进行唯一性检查，可以通过 Attributive 系统来实现：

```javascript
const UniqueEmailAttributive = Attributive.create({
  name: 'UniqueEmail',
  content: async function(user, { system }) {
    const existingUser = await system.storage.findOne('User', 
      MatchExp.atom({ key: 'email', value: ['=', user.email] })
    );
    return !existingUser || existingUser.id === user.id;
  }
});
```

## 完整示例

以下是一个完整的用户实体定义示例：

```javascript
import { Entity, Property } from '@interaqt/runtime';

const User = Entity.create({
  name: 'User',
  properties: [
    // 基本信息
    Property.create({ 
      name: 'email', 
      type: 'string',
      required: true
    }),
    Property.create({ 
      name: 'firstName', 
      type: 'string',
      required: true
    }),
    Property.create({ 
      name: 'lastName', 
      type: 'string',
      required: true
    }),
    
    // 计算属性
    Property.create({
      name: 'fullName',
      type: 'string',
      getValue: (record) => `${record.firstName} ${record.lastName}`
    }),
    
    // 带默认值的字段
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: 'active'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    
    // JSON 字段
    Property.create({ 
      name: 'profile', 
      type: 'object',
      collection: false,
      defaultValue: {}
    }),
    Property.create({ 
      name: 'tags', 
      type: 'string',
      collection: true,
      defaultValue: []
    }),
    
    // 可选字段
    Property.create({ 
      name: 'bio', 
      type: 'string',
      required: false
    }),
    Property.create({ 
      name: 'avatar', 
      type: 'string',
      required: false
    })
  ]
});

export { User };
``` 