import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property } from '@core';
import { DBSetup } from '@storage';
import { PGLiteDB } from '@drivers';

describe('Merged Entity Input Relation Issue', () => {
    it('should fail when creating relation with merged entity input - both as source and target', () => {
        const db = new PGLiteDB();

        // 定义两个普通 entity
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ]
        });

        // 定义第三个普通 entity 作为 merged entity 的另一个 input
        const Guest = Entity.create({
            name: 'Guest',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'sessionId', type: 'string' })
            ]
        });

        // 创建 merged entity，将 User 和 Guest 作为 input entities
        // 这会导致 User 被强制转换为 filtered entity
        const Contact = Entity.create({
            name: 'Contact',
            inputEntities: [User, Guest]
        });

        // 尝试创建 Relation，使用 User（现在是 Contact 的 input entity）作为 source
        // 由于 User 被转换成了 filtered entity，这应该会抛出错误
        const UserPostRelation = Relation.create({
            source: User,
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: 'n:1'
        });

        const entities = [User, Post, Guest, Contact];
        const relations = [UserPostRelation];

        // 这应该会抛出错误，因为 User 现在有 baseEntity 属性
        new DBSetup(entities, relations, db);
    });

    it('should fail when creating relation with merged entity input as target', () => {
        const db = new PGLiteDB();

        // 定义普通 entity
        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ]
        });

        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        const Admin = Entity.create({
            name: 'Admin',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'role', type: 'string' })
            ]
        });

        // 创建 merged entity，User 作为 input
        const Account = Entity.create({
            name: 'Account',
            inputEntities: [User, Admin]
        });

        // 尝试创建 Relation，使用 User 作为 target
        const PostAuthorRelation = Relation.create({
            source: Post,
            sourceProperty: 'author',
            target: User,  // User 现在是 filtered entity
            targetProperty: 'posts',
            type: '1:n'
        });

        const entities = [Post, User, Admin, Account];
        const relations = [PostAuthorRelation];

        // 这应该会抛出错误
        new DBSetup(entities, relations, db);
    });

    it('should fail when both source and target are merged entity inputs', () => {
        const db = new PGLiteDB();

        // 定义普通 entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        const Guest = Entity.create({
            name: 'Guest',
            properties: [
                Property.create({ name: 'sessionId', type: 'string' })
            ]
        });

        const Article = Entity.create({
            name: 'Article',
            properties: [
                Property.create({ name: 'content', type: 'string' })
            ]
        });

        // 创建两个 merged entities，分别使用 User 和 Post 作为 input
        const Contact = Entity.create({
            name: 'Contact',
            inputEntities: [User, Guest]
        });

        const Content = Entity.create({
            name: 'Content',
            inputEntities: [Post, Article]
        });

        // 尝试创建 Relation，User 和 Post 都是各自 merged entity 的 input
        const UserPostRelation = Relation.create({
            source: User,
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: 'n:1'
        });

        const entities = [User, Post, Guest, Article, Contact, Content];
        const relations = [UserPostRelation];

        // 这应该会抛出错误
        new DBSetup(entities, relations, db);
    });
});

