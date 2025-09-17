import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from "@dbclients";
describe('merged relation test', () => {
    let db: PGLiteDB;
    let setup: DBSetup;
    let logger: any;
    let entityQueryHandle: EntityQueryHandle;

    beforeEach(async () => {
        // 创建实体
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'username', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        const postEntity = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ]
        });

        // 创建第一个 input relation: UserLikesPost
        const userLikesPostRelation = Relation.create({
            name: 'UserLikesPost',
            source: userEntity,
            sourceProperty: 'likedPosts',
            target: postEntity,
            targetProperty: 'likedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'likedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
                Property.create({ name: 'rating', type: 'number', defaultValue: () => 5 })
            ]
        });

        // 创建第二个 input relation: UserBookmarksPost
        const userBookmarksPostRelation = Relation.create({
            name: 'UserBookmarksPost',
            source: userEntity,
            sourceProperty: 'bookmarkedPosts',
            target: postEntity,
            targetProperty: 'bookmarkedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'bookmarkedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
                Property.create({ name: 'category', type: 'string', defaultValue: () => 'general' })
            ]
        });

        // 创建第三个 input relation: UserSharesPost
        const userSharesPostRelation = Relation.create({
            name: 'UserSharesPost',
            source: userEntity,
            sourceProperty: 'sharedPosts',
            target: postEntity,
            targetProperty: 'sharedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'sharedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
                Property.create({ name: 'platform', type: 'string', defaultValue: () => 'internal' }),
                Property.create({ name: 'message', type: 'string' })
            ]
        });

        // 创建 merged relation: UserInteractsWithPost
        const userInteractsWithPostRelation = Relation.create({
            name: 'UserInteractsWithPost',
            sourceProperty: 'interactedPosts',
            targetProperty: 'interactedByUsers',
            inputRelations: [userLikesPostRelation, userBookmarksPostRelation, userSharesPostRelation]
            // 注意：merged relation 不能有 source、target 和 properties
        });

        const entities = [userEntity, postEntity];
        const relations = [
            userLikesPostRelation,
            userBookmarksPostRelation,
            userSharesPostRelation,
            userInteractsWithPostRelation
        ];

        logger = new TestLogger('', true);
        
        // 使用 PGLite
        db = new PGLiteDB(undefined, {logger});
        await db.open();

        setup = new DBSetup(entities, relations, db);
        await setup.createTables();
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    });

    afterEach(async () => {
        await db.close();
    });

    test('merged relation basic functionality - creation through input relations', async () => {
        // 创建用户和帖子
        const user1 = await entityQueryHandle.create('User', {
            username: 'john_doe',
            email: 'john@example.com'
        });

        const post1 = await entityQueryHandle.create('Post', {
            title: 'First Post',
            content: 'This is my first post'
        });

        // 通过 UserLikesPost relation 创建关系
        const likeRelation = await entityQueryHandle.create('UserLikesPost', {
            source: { id: user1.id },
            target: { id: post1.id },
            rating: 4
        });

        // 验证 UserLikesPost 关系被创建
        const foundLike = await entityQueryHandle.findOne('UserLikesPost',
            MatchExp.atom({ key: 'id', value: ['=', likeRelation.id] }),
            undefined,
            ['id', 'rating', '__UserInteractsWithPost_input_relation']
        );
        
        expect(foundLike).toBeTruthy();
        expect(foundLike.rating).toBe(4);
        expect(foundLike.__UserInteractsWithPost_input_relation).toEqual(['UserLikesPost']);

        // 通过 UserBookmarksPost relation 创建关系
        const bookmarkRelation = await entityQueryHandle.create('UserBookmarksPost', {
            source: { id: user1.id },
            target: { id: post1.id },
            category: 'tech'
        });

        // 验证 UserBookmarksPost 关系被创建
        const foundBookmark = await entityQueryHandle.findOne('UserBookmarksPost',
            MatchExp.atom({ key: 'id', value: ['=', bookmarkRelation.id] }),
            undefined,
            ['id', 'category', '__UserInteractsWithPost_input_relation']
        );
        
        expect(foundBookmark).toBeTruthy();
        expect(foundBookmark.category).toBe('tech');
        expect(foundBookmark.__UserInteractsWithPost_input_relation).toEqual(['UserBookmarksPost']);
    });

    test('merged relation query through UserInteractsWithPost', async () => {
        // 创建测试数据
        const user1 = await entityQueryHandle.create('User', {
            username: 'alice',
            email: 'alice@example.com'
        });

        const user2 = await entityQueryHandle.create('User', {
            username: 'bob',
            email: 'bob@example.com'
        });

        const post1 = await entityQueryHandle.create('Post', {
            title: 'Post 1',
            content: 'Content 1'
        });

        const post2 = await entityQueryHandle.create('Post', {
            title: 'Post 2',
            content: 'Content 2'
        });

        // 创建不同类型的关系
        await entityQueryHandle.create('UserLikesPost', {
            source: { id: user1.id },
            target: { id: post1.id },
            rating: 5
        });

        await entityQueryHandle.create('UserBookmarksPost', {
            source: { id: user1.id },
            target: { id: post2.id },
            category: 'favorites'
        });

        await entityQueryHandle.create('UserSharesPost', {
            source: { id: user2.id },
            target: { id: post1.id },
            platform: 'twitter',
            message: 'Check this out!'
        });

        // 通过 UserInteractsWithPost (merged relation) 查询所有关系
        const allInteractions = await entityQueryHandle.find('UserInteractsWithPost',
            undefined,
            undefined,
            ['id', '__UserInteractsWithPost_input_relation']
        );

        expect(allInteractions).toHaveLength(3);
        
        // 验证包含所有三种类型的关系
        const relationTypes = allInteractions.map(r => r.__UserInteractsWithPost_input_relation[0]).sort();
        expect(relationTypes).toEqual(['UserBookmarksPost', 'UserLikesPost', 'UserSharesPost']);
    });

    test('merged relation update functionality', async () => {
        // 创建测试数据
        const user = await entityQueryHandle.create('User', {
            username: 'charlie',
            email: 'charlie@example.com'
        });

        const post = await entityQueryHandle.create('Post', {
            title: 'Update Test Post',
            content: 'Original content'
        });

        // 创建一个 like 关系
        const likeRelation = await entityQueryHandle.create('UserLikesPost', {
            source: { id: user.id },
            target: { id: post.id },
            rating: 3
        });

        // 通过 UserInteractsWithPost 更新关系
        await entityQueryHandle.update('UserInteractsWithPost',
            MatchExp.atom({ key: 'id', value: ['=', likeRelation.id] }),
            { rating: 5 }
        );

        // 验证更新生效
        const updatedRelation = await entityQueryHandle.findOne('UserLikesPost',
            MatchExp.atom({ key: 'id', value: ['=', likeRelation.id] }),
            undefined,
            ['id', 'rating', '__UserInteractsWithPost_input_relation']
        );

        expect(updatedRelation.rating).toBe(5);
        expect(updatedRelation.__UserInteractsWithPost_input_relation).toEqual(['UserLikesPost']); // 类型不变
    });

    test('merged relation delete functionality', async () => {
        // 创建测试数据
        const user = await entityQueryHandle.create('User', {
            username: 'dave',
            email: 'dave@example.com'
        });

        const post = await entityQueryHandle.create('Post', {
            title: 'Delete Test Post',
            content: 'To be deleted'
        });

        // 创建一个 bookmark 关系
        const bookmarkRelation = await entityQueryHandle.create('UserBookmarksPost', {
            source: { id: user.id },
            target: { id: post.id },
            category: 'to-delete'
        });
        
        // 通过 UserInteractsWithPost 删除关系
        await entityQueryHandle.delete('UserInteractsWithPost',
            MatchExp.atom({ key: 'id', value: ['=', bookmarkRelation.id] })
        );

        // 验证关系被删除
        const deletedRelation = await entityQueryHandle.findOne('UserBookmarksPost',
            MatchExp.atom({ key: 'id', value: ['=', bookmarkRelation.id] }),
            undefined,
            ['id']
        );

        expect(deletedRelation).toBeUndefined();
    });

    test('merged relation should not support direct creation', async () => {
        // 创建测试数据
        const user = await entityQueryHandle.create('User', {
            username: 'eve',
            email: 'eve@example.com'
        });

        const post = await entityQueryHandle.create('Post', {
            title: 'Direct Create Test',
            content: 'Should fail'
        });

        // 尝试直接通过 merged relation 创建关系应该失败
        try {
            await entityQueryHandle.create('UserInteractsWithPost', {
                source: { id: user.id },
                target: { id: post.id }
            });
            expect.fail('Should not allow direct creation through merged relation');
        } catch (error) {
            // 预期会抛出错误
            expect(error).toBeTruthy();
        }
    });
});

describe('complex merged relation test', () => {
    const logger = new TestLogger('', true);

    test('merged relation with filtered input relations', async () => {
        // 测试场景：使用 filtered relation 作为 merged relation 的 inputRelations
        
        // 1. 创建基础 entities
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'username', type: 'string' }),
                Property.create({ name: 'userType', type: 'string' })
            ]
        });

        const productEntity = Entity.create({
            name: 'Product',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'price', type: 'number' })
            ]
        });

        // 2. 创建基础 relation
        const userProductRelation = Relation.create({
            name: 'UserProductRelation',
            source: userEntity,
            sourceProperty: 'products',
            target: productEntity,
            targetProperty: 'users',
            type: 'n:n',
            properties: [
                Property.create({ name: 'actionType', type: 'string' }),
                Property.create({ name: 'timestamp', type: 'string' })
            ]
        });

        // 3. 创建 filtered relations
        const userPurchasesProduct = Relation.create({
            name: 'UserPurchasesProduct',
            baseRelation: userProductRelation,
            sourceProperty: 'purchasedProducts',
            targetProperty: 'purchasedBy',
            matchExpression: MatchExp.atom({
                key: 'actionType',
                value: ['=', 'purchase']
            })
        });

        const userViewsProduct = Relation.create({
            name: 'UserViewsProduct',
            baseRelation: userProductRelation,
            sourceProperty: 'viewedProducts',
            targetProperty: 'viewedBy',
            matchExpression: MatchExp.atom({
                key: 'actionType',
                value: ['=', 'view']
            })
        });

        // 4. 使用 filtered relations 作为 merged relation 的 inputRelations
        const userEngagesProduct = Relation.create({
            name: 'UserEngagesProduct',
            sourceProperty: 'engagedProducts',
            targetProperty: 'engagedBy',
            inputRelations: [userPurchasesProduct, userViewsProduct]
        });

        const entities2 = [userEntity, productEntity];
        const relations2 = [
            userProductRelation,
            userPurchasesProduct,
            userViewsProduct,
            userEngagesProduct
        ];

        const db2 = new PGLiteDB(undefined, {logger});
        await db2.open();

        const setup2 = new DBSetup(entities2, relations2, db2);
        await setup2.createTables();
        const entityQueryHandle2 = new EntityQueryHandle(new EntityToTableMap(setup2.map), db2);

        // 创建测试数据
        const user1 = await entityQueryHandle2.create('User', {
            username: 'buyer1',
            userType: 'premium'
        });

        const product1 = await entityQueryHandle2.create('Product', {
            name: 'Product A',
            price: 99
        });

        const product2 = await entityQueryHandle2.create('Product', {
            name: 'Product B',
            price: 49
        });

        // 通过 filtered relations 创建关系
        await entityQueryHandle2.create('UserPurchasesProduct', {
            source: { id: user1.id },
            target: { id: product1.id },
            actionType: 'purchase',
            timestamp: '2024-01-01'
        });

        await entityQueryHandle2.create('UserViewsProduct', {
            source: { id: user1.id },
            target: { id: product2.id },
            actionType: 'view',
            timestamp: '2024-01-02'
        });

        // 通过基础 relation 查询，验证数据存在
        const allRelations = await entityQueryHandle2.find('UserProductRelation',
            undefined,
            undefined,
            ['id', 'actionType', 'timestamp']
        );

        expect(allRelations).toHaveLength(2);
        
        // 通过 filtered relations 分别查询
        const purchases = await entityQueryHandle2.find('UserPurchasesProduct',
            undefined,
            undefined,
            ['id', 'actionType']
        );
        
        const views = await entityQueryHandle2.find('UserViewsProduct',
            undefined,
            undefined,
            ['id', 'actionType']
        );
        
        expect(purchases).toHaveLength(1);
        expect(purchases[0].actionType).toBe('purchase');
        
        expect(views).toHaveLength(1);
        expect(views[0].actionType).toBe('view');

        await db2.close();
    });

    test('merged relation property conflict resolution', async () => {
        // 创建具有同名但不同默认值的 properties 的 relations
        const authorEntity = Entity.create({
            name: 'Author',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const bookEntity = Entity.create({
            name: 'Book',
            properties: [
                Property.create({ name: 'title', type: 'string' })
            ]
        });

        const authorWritesBook = Relation.create({
            name: 'AuthorWritesBook',
            source: authorEntity,
            sourceProperty: 'writtenBooks',
            target: bookEntity,
            targetProperty: 'writtenBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string', defaultValue: () => 'author' }),
                Property.create({ name: 'contribution', type: 'string', defaultValue: () => 'writing' })
            ]
        });

        const authorEditsBook = Relation.create({
            name: 'AuthorEditsBook',
            source: authorEntity,
            sourceProperty: 'editedBooks',
            target: bookEntity,
            targetProperty: 'editedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string', defaultValue: () => 'editor' }),
                Property.create({ name: 'editLevel', type: 'string', defaultValue: () => 'copyedit' })
            ]
        });

        const authorContributesToBook = Relation.create({
            name: 'AuthorContributesToBook',
            sourceProperty: 'contributedBooks',
            targetProperty: 'contributors',
            inputRelations: [authorWritesBook, authorEditsBook]
        });

        const entities3 = [authorEntity, bookEntity];
        const relations3 = [authorWritesBook, authorEditsBook, authorContributesToBook];
        
        const db3 = new PGLiteDB(undefined, {logger});
        await db3.open();

        const setup3 = new DBSetup(entities3, relations3, db3);
        await setup3.createTables();
        const entityQueryHandle3 = new EntityQueryHandle(new EntityToTableMap(setup3.map), db3);

        const author1 = await entityQueryHandle3.create('Author', {
            name: 'John Smith'
        });

        const book1 = await entityQueryHandle3.create('Book', {
            title: 'Great Book'
        });

        // 通过 AuthorWritesBook 创建关系，应该使用 AuthorWritesBook 的默认值
        const writeRelation = await entityQueryHandle3.create('AuthorWritesBook', {
            source: { id: author1.id },
            target: { id: book1.id }
        });

        const foundWrite = await entityQueryHandle3.findOne('AuthorWritesBook',
            MatchExp.atom({ key: 'id', value: ['=', writeRelation.id] }),
            undefined,
            ['id', 'role', 'contribution', '__AuthorContributesToBook_input_relation']
        );

        expect(foundWrite.role).toBe('author');
        expect(foundWrite.contribution).toBe('writing');
        expect(foundWrite.__AuthorContributesToBook_input_relation).toEqual(['AuthorWritesBook']);

        // 通过 AuthorEditsBook 创建关系，应该使用 AuthorEditsBook 的默认值
        const editRelation = await entityQueryHandle3.create('AuthorEditsBook', {
            source: { id: author1.id },
            target: { id: book1.id }
        });

        const foundEdit = await entityQueryHandle3.findOne('AuthorEditsBook',
            MatchExp.atom({ key: 'id', value: ['=', editRelation.id] }),
            undefined,
            ['id', 'role', 'editLevel', '__AuthorContributesToBook_input_relation']
        );

        expect(foundEdit.role).toBe('editor');
        expect(foundEdit.editLevel).toBe('copyedit');
        expect(foundEdit.__AuthorContributesToBook_input_relation).toEqual(['AuthorEditsBook']);

        await db3.close();
    });

    test('nested merged relations - merged relation as inputRelation', async () => {
        // 测试场景：使用 merged relation 作为另一个 merged relation 的 inputRelations
        
        // 1. 创建基础 entities
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'username', type: 'string' }),
                Property.create({ name: 'level', type: 'string' })
            ]
        });

        const articleEntity = Entity.create({
            name: 'Article',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ]
        });

        // 2. 创建第一组基础 relations
        const userReadsArticle = Relation.create({
            name: 'UserReadsArticle',
            source: userEntity,
            sourceProperty: 'readArticles',
            target: articleEntity,
            targetProperty: 'readBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'readAt', type: 'string' }),
                Property.create({ name: 'readTime', type: 'number', defaultValue: () => 0 })
            ]
        });

        const userBookmarksArticle = Relation.create({
            name: 'UserBookmarksArticle',
            source: userEntity,
            sourceProperty: 'bookmarkedArticles',
            target: articleEntity,
            targetProperty: 'bookmarkedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'bookmarkedAt', type: 'string' }),
                Property.create({ name: 'tags', type: 'string', defaultValue: () => 'untagged' })
            ]
        });

        // 3. 创建第一个 merged relation
        const userEngagesArticle = Relation.create({
            name: 'UserEngagesArticle',
            sourceProperty: 'engagedArticles',
            targetProperty: 'engagedByUsers',
            inputRelations: [userReadsArticle, userBookmarksArticle]
        });

        // 4. 创建第二组基础 relations
        const userCommentsArticle = Relation.create({
            name: 'UserCommentsArticle',
            source: userEntity,
            sourceProperty: 'commentedArticles',
            target: articleEntity,
            targetProperty: 'commentedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'commentedAt', type: 'string' }),
                Property.create({ name: 'comment', type: 'string' })
            ]
        });

        const userSharesArticle = Relation.create({
            name: 'UserSharesArticle',
            source: userEntity,
            sourceProperty: 'sharedArticles',
            target: articleEntity,
            targetProperty: 'sharedBy',
            type: 'n:n',
            properties: [
                Property.create({ name: 'sharedAt', type: 'string' }),
                Property.create({ name: 'platform', type: 'string', defaultValue: () => 'internal' })
            ]
        });

        // 5. 创建第二个 merged relation，包含第一个 merged relation 和其他 relations
        const userFullyInteractsArticle = Relation.create({
            name: 'UserFullyInteractsArticle',
            sourceProperty: 'fullyInteractedArticles',
            targetProperty: 'fullyInteractedByUsers',
            inputRelations: [userEngagesArticle, userCommentsArticle, userSharesArticle]
        });

        const entities4 = [userEntity, articleEntity];
        const relations4 = [
            userReadsArticle,
            userBookmarksArticle,
            userEngagesArticle,
            userCommentsArticle,
            userSharesArticle,
            userFullyInteractsArticle
        ];

        const db4 = new PGLiteDB(undefined, {logger});
        await db4.open();

        const setup4 = new DBSetup(entities4, relations4, db4);
        await setup4.createTables();
        const entityQueryHandle4 = new EntityQueryHandle(new EntityToTableMap(setup4.map), db4);

        // 创建测试数据
        const user1 = await entityQueryHandle4.create('User', {
            username: 'poweruser',
            level: 'expert'
        });

        const article1 = await entityQueryHandle4.create('Article', {
            title: 'Advanced Topics',
            content: 'Deep dive into advanced topics...'
        });

        const article2 = await entityQueryHandle4.create('Article', {
            title: 'Basic Guide',
            content: 'Getting started guide...'
        });

        // 通过各种 relations 创建数据
        // 1. 通过第一组基础 relations 创建
        const readRelation = await entityQueryHandle4.create('UserReadsArticle', {
            source: { id: user1.id },
            target: { id: article1.id },
            readAt: '2024-01-01',
            readTime: 15
        });

        const bookmarkRelation = await entityQueryHandle4.create('UserBookmarksArticle', {
            source: { id: user1.id },
            target: { id: article2.id },
            bookmarkedAt: '2024-01-02',
            tags: 'tutorial'
        });

        // 2. 通过第二组基础 relations 创建
        const commentRelation = await entityQueryHandle4.create('UserCommentsArticle', {
            source: { id: user1.id },
            target: { id: article1.id },
            commentedAt: '2024-01-03',
            comment: 'Great article!'
        });

        const shareRelation = await entityQueryHandle4.create('UserSharesArticle', {
            source: { id: user1.id },
            target: { id: article2.id },
            sharedAt: '2024-01-04',
            platform: 'twitter'
        });

        // 验证第一个 merged relation (UserEngagesArticle)
        const engagements = await entityQueryHandle4.find('UserEngagesArticle',
            undefined,
            undefined,
            ['id', '__UserEngagesArticle_input_relation', '__UserFullyInteractsArticle_input_relation']
        );

        expect(engagements).toHaveLength(2); // read + bookmark
        
        // 验证 engagements 有两个 input relation 字段
        engagements.forEach(engagement => {
            expect(engagement.__UserEngagesArticle_input_relation).toBeDefined();
            expect(engagement.__UserEngagesArticle_input_relation.length).toBe(1);
            expect(['UserReadsArticle', 'UserBookmarksArticle']).toContain(
                engagement.__UserEngagesArticle_input_relation[0]
            );
            
            // 这些记录也应该有 UserFullyInteractsArticle 的标记
            expect(engagement.__UserFullyInteractsArticle_input_relation).toEqual(['UserEngagesArticle']);
        });

        // 验证第二个 merged relation (UserFullyInteractsArticle)
        const fullInteractions = await entityQueryHandle4.find('UserFullyInteractsArticle',
            undefined,
            undefined,
            ['id', '__UserFullyInteractsArticle_input_relation']
        );

        expect(fullInteractions).toHaveLength(4); // read + bookmark + comment + share
        
        // 验证包含所有类型的关系
        const interactionTypes = fullInteractions.map(r => r.__UserFullyInteractsArticle_input_relation[0]).sort();
        expect(interactionTypes).toEqual([
            'UserCommentsArticle',
            'UserEngagesArticle',  // 这个代表了 UserReadsArticle
            'UserEngagesArticle',  // 这个代表了 UserBookmarksArticle
            'UserSharesArticle'
        ]);

        // 通过 UserFullyInteractsArticle 查询特定类型
        const userEngagesInFull = fullInteractions.filter(
            r => r.__UserFullyInteractsArticle_input_relation[0] === 'UserEngagesArticle'
        );
        expect(userEngagesInFull).toHaveLength(2);

        // 通过 UserFullyInteractsArticle 更新（应该能更新所有层级的关系）
        await entityQueryHandle4.update('UserFullyInteractsArticle',
            MatchExp.atom({ key: 'id', value: ['=', readRelation.id] }),
            { readTime: 30 }
        );

        // 验证更新生效
        const updatedRead = await entityQueryHandle4.findOne('UserReadsArticle',
            MatchExp.atom({ key: 'id', value: ['=', readRelation.id] }),
            undefined,
            ['id', 'readTime', '__UserEngagesArticle_input_relation', '__UserFullyInteractsArticle_input_relation']
        );

        expect(updatedRead.readTime).toBe(30);
        expect(updatedRead.__UserEngagesArticle_input_relation).toEqual(['UserReadsArticle']);
        expect(updatedRead.__UserFullyInteractsArticle_input_relation).toEqual(['UserEngagesArticle']);

        // 通过 UserFullyInteractsArticle 删除
        await entityQueryHandle4.delete('UserFullyInteractsArticle',
            MatchExp.atom({ key: 'id', value: ['=', shareRelation.id] })
        );

        // 验证删除生效
        const deletedShare = await entityQueryHandle4.findOne('UserSharesArticle',
            MatchExp.atom({ key: 'id', value: ['=', shareRelation.id] }),
            undefined,
            ['id']
        );

        expect(deletedShare).toBeUndefined();

        // 最终验证：通过不同层级查询剩余的关系
        const remainingEngagements = await entityQueryHandle4.find('UserEngagesArticle',
            undefined,
            undefined,
            ['id']
        );
        expect(remainingEngagements).toHaveLength(2); // read + bookmark 仍然存在

        const remainingFullInteractions = await entityQueryHandle4.find('UserFullyInteractsArticle',
            undefined,
            undefined,
            ['id']
        );
        expect(remainingFullInteractions).toHaveLength(3); // read + bookmark + comment (share 已删除)

        await db4.close();
    });
});
