import { Entity, Property } from '@/index.js'

// 不包含响应式计算的基础实体定义

// 用户实体（基础版本）
export const User = Entity.create({
  name: 'User',
  properties: [
    // 基本信息
    Property.create({ 
      name: 'username', 
      type: 'string', 
      required: true,
      unique: true,
      minLength: 3,
      maxLength: 30
    }),
    Property.create({ 
      name: 'email', 
      type: 'string', 
      required: true,
      unique: true
    }),
    Property.create({ 
      name: 'displayName', 
      type: 'string', 
      required: true,
      maxLength: 50
    }),
    Property.create({ 
      name: 'bio', 
      type: 'string',
      maxLength: 500
    }),
    Property.create({ 
      name: 'avatar', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString(),
      index: true
    }),
    Property.create({ 
      name: 'lastActiveAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString(),
      index: true
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean', 
      defaultValue: () => true,
      index: true
    })
  ]
})

// 帖子实体（基础版本）
export const Post = Entity.create({
  name: 'Post',
  properties: [
    // 基本信息
    Property.create({ 
      name: 'title', 
      type: 'string', 
      required: true,
      maxLength: 200
    }),
    Property.create({ 
      name: 'content', 
      type: 'string', 
      required: true
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft',
      index: true
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString(),
      index: true
    }),
    Property.create({ 
      name: 'publishedAt', 
      type: 'string',
      index: true
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// 标签实体（基础版本）
export const Tag = Entity.create({
  name: 'Tag',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string', 
      required: true,
      unique: true,
      maxLength: 50
    }),
    Property.create({ 
      name: 'description', 
      type: 'string',
      maxLength: 200
    }),
    Property.create({ 
      name: 'color', 
      type: 'string', 
      defaultValue: () => '#666666'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// 分类实体（基础版本）
export const Category = Entity.create({
  name: 'Category',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string', 
      required: true,
      unique: true,
      maxLength: 100
    }),
    Property.create({ 
      name: 'description', 
      type: 'string',
      maxLength: 500
    }),
    Property.create({ 
      name: 'parentId', 
      type: 'string',
      isRef: true,
      refEntity: 'Category'
    }),
    Property.create({ 
      name: 'order', 
      type: 'number', 
      defaultValue: () => 0,
      index: true
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean', 
      defaultValue: () => true,
      index: true
    })
  ]
})