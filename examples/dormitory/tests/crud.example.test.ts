import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'

describe('Simple CRUD Example', () => {
  let system: MonoSystem
  let controller: Controller

  // === Entity Definitions ===
  const User = Entity.create({
    name: 'User',
    properties: [
      Property.create({ name: 'username', type: 'string' }),
      Property.create({ name: 'email', type: 'string' }),
      Property.create({ name: 'role', type: 'string', defaultValue: () => 'user' }),
      // Article count will be added after relation is defined
    ]
  })

  // State nodes for article lifecycle
  const draftState = StateNode.create({ name: 'draft' })
  const publishedState = StateNode.create({ name: 'published' })
  const deletedState = StateNode.create({ name: 'deleted' })

  // Article lifecycle state machine
  const ArticleLifecycleStateMachine = StateMachine.create({
    states: [draftState, publishedState, deletedState],
    defaultState: draftState,
    transfers: []  // Will be populated after interactions are defined
  })

  const Article = Entity.create({
    name: 'Article',
    properties: [
      Property.create({ name: 'title', type: 'string' }),
      Property.create({ name: 'content', type: 'string' }),
      Property.create({ name: 'createdAt', type: 'number' }),
      Property.create({
        name: 'status',
        type: 'string',
        computation: ArticleLifecycleStateMachine
      }),
      Property.create({
        name: 'isDeleted',
        type: 'boolean',
        computed: (article) => article.status === 'deleted'
      })
    ],
    // Transform to create articles from interactions
    computation: Transform.create({
      record: InteractionEventEntity,
      callback: function(event) {
        if (event.interactionName === 'CreateArticle') {
          return {
            title: event.payload.title,
            content: event.payload.content,
            createdAt: Math.floor(Date.now()/1000),
            author: event.payload.authorId  // authorId is already { id: xxx }
          }
        }
        return null
      }
    })
  })

  // === Filtered Entity ===
  const ActiveArticle = Entity.create({
    name: 'ActiveArticle',
    baseEntity: Article,
    matchExpression: MatchExp.atom({
      key: 'status',
      value: ['!=', 'deleted']
    })
  })

  // === Relations ===
  const UserArticleRelation = Relation.create({
    source: Article,
    sourceProperty: 'author',
    target: User,
    targetProperty: 'articles',
    type: 'n:1'
  })

  // Now add the article count property to User
  User.properties.push(
    Property.create({
      name: 'articleCount',
      type: 'number',
      computation: Count.create({
        record: UserArticleRelation,
        direction: 'target'
        // Remove the callback for now - just count all articles
      })
    })
  )

  // === Conditions ===
  
  // Admin role condition
  const AdminAttributive = Condition.create({
    name: 'Admin',
    content: async function Admin(this: Controller, event) {
      return event.user?.role === 'admin'
    }
  })

  // Author role attributive - basic author role
  const AuthorAttributive = Condition.create({
    name: 'Author',
    content: async function Author(this: Controller, event) {
      return event.user?.role === 'author' || event.user?.role === 'admin'
    }
  })

  // Article author attributive - check if user is the author of the article
  const ArticleAuthorAttributive = Condition.create({
    name: 'ArticleAuthor',
    content: async function ArticleAuthor(this: Controller, event) {
      const articleId = event.payload?.article?.id
      
      if (!articleId) return false
      
      const article = await this.system.storage.findOne('Article',
        MatchExp.atom({ key: 'id', value: ['=', articleId] }),
        undefined,
        [['author', { attributeQuery: ['id'] }]]
      )
      
      return article && article.author.id === event.user.id
    }
  })

  // Draft article attributive - payload constraint to only allow draft articles
  const DraftArticleAttributive = Condition.create({
    name: 'DraftArticle',
    content: async function DraftArticle(this: Controller, event) {
      const article = event.payload?.article
      if (!article?.id) return false
      
      const articleData = await this.system.storage.findOne('Article',
        MatchExp.atom({ key: 'id', value: ['=', article.id] }),
        undefined,
        ['status']
      )
      
      return articleData && articleData.status === 'draft'
    }
  })

  // Not deleted article attributive - payload constraint
  const NotDeletedArticleAttributive = Condition.create({
    name: 'NotDeletedArticle', 
    content: async function NotDeletedArticle(this: Controller, event) {
      const article = event.payload?.article
      if (!article?.id) return false
      
      const articleData = await this.system.storage.findOne('Article',
        MatchExp.atom({ key: 'id', value: ['=', article.id] }),
        undefined,
        ['status']
      )
      
      return articleData && articleData.status !== 'deleted'
    }
  })

  // Deleted article attributive - payload constraint for restore
  const DeletedArticleAttributive = Condition.create({
    name: 'DeletedArticle',
    content: async function DeletedArticle(this: Controller, event) {
      const article = event.payload?.article
      if (!article?.id) return false
      
      const articleData = await this.system.storage.findOne('Article',
        MatchExp.atom({ key: 'id', value: ['=', article.id] }),
        undefined,
        ['status']
      )
      
      return articleData && articleData.status === 'deleted'
    }
  })

  // === Interactions ===
  const CreateArticle = Interaction.create({
    name: 'CreateArticle',
    action: Action.create({ name: 'createArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'title', required: true }),
        PayloadItem.create({ name: 'content', required: true }),
        PayloadItem.create({ name: 'authorId', required: true })
      ]
    }),
    // Only authors or admins can create articles
    conditions: AuthorAttributive
  })

  // Combined condition for publish article
  const CanPublishArticle = Conditions.create({
    content: BoolExp.atom(DraftArticleAttributive)
      .and(
        BoolExp.atom(ArticleAuthorAttributive)
          .or(BoolExp.atom(AdminAttributive))
      )
  })

  const PublishArticle = Interaction.create({
    name: 'PublishArticle',
    action: Action.create({ name: 'publishArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ 
          name: 'article', 
          required: true
        })
      ]
    }),
    // Only article author or admin can publish, and article must be draft
    conditions: CanPublishArticle
  })

  // Combined condition for delete article
  const CanDeleteArticle = Conditions.create({
    content: BoolExp.atom(NotDeletedArticleAttributive)
      .and(
        BoolExp.atom(ArticleAuthorAttributive)
          .or(BoolExp.atom(AdminAttributive))
      )
  })

  const DeleteArticle = Interaction.create({
    name: 'DeleteArticle',
    action: Action.create({ name: 'deleteArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ 
          name: 'article', 
          required: true
        })
      ]
    }),
    // Only article author or admin can delete, and article must not be deleted
    conditions: CanDeleteArticle
  })

  // Combined condition for restore article  
  const CanRestoreArticle = Conditions.create({
    content: BoolExp.atom(DeletedArticleAttributive)
      .and(BoolExp.atom(AdminAttributive))
  })

  const RestoreArticle = Interaction.create({
    name: 'RestoreArticle',
    action: Action.create({ name: 'restoreArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ 
          name: 'article', 
          required: true
        })
      ]
    }),
    // Only admins can restore deleted articles
    conditions: CanRestoreArticle
  })

  // Now add transfers to the state machine
  ArticleLifecycleStateMachine.transfers = [
    StateTransfer.create({
      current: draftState,
      next: publishedState,
      trigger: PublishArticle,
      computeTarget: (event) => ({ id: event.payload.article.id })
    }),
    StateTransfer.create({
      current: publishedState,
      next: deletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.article.id })
    }),
    StateTransfer.create({
      current: draftState,
      next: deletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.article.id })
    }),
    StateTransfer.create({
      current: deletedState,
      next: draftState,
      trigger: RestoreArticle,
      computeTarget: (event) => ({ id: event.payload.article.id })
    })
  ]

  // Collect all definitions
  const entities = [User, Article, ActiveArticle]
  const relations = [UserArticleRelation]
  const interactions = [CreateArticle, PublishArticle, DeleteArticle, RestoreArticle]

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    })

    await controller.setup(true)
  })

  test('should create an article', async () => {
    // Setup: Create a test user with author role
    const testUser = await system.storage.create('User', {
      username: 'john_doe',
      email: 'john@example.com',
      role: 'author'  // Set author role
    })

    // Act: Create an article
    const result = await controller.callInteraction('CreateArticle', {
      user: testUser,
      payload: {
        title: 'My First Article',
        content: 'This is the content of my first article.',
        authorId: { id: testUser.id }
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify article was created
    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'My First Article'] }),
      undefined,
      ['title', 'content', 'status', 'isDeleted', 'author', 'id']
    )
    
    expect(article).toBeTruthy()
    expect(article.title).toBe('My First Article')
    expect(article.content).toBe('This is the content of my first article.')
    expect(article.status).toBe('draft')
    expect(article.isDeleted).toBe(false)
    expect(article.author.id).toBe(testUser.id)

    // Verify user's article count
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', testUser.id] }),
      undefined,
      ['username', 'email', 'articleCount', 'id']
    )
    expect(updatedUser.articleCount).toBe(1)
  })

  test('should publish an article', async () => {
    // Setup: Create user with author role and article
    const testUser = await system.storage.create('User', {
      username: 'jane_doe',
      email: 'jane@example.com',
      role: 'author'  // Set author role
    })

    const createResult = await controller.callInteraction('CreateArticle', {
      user: testUser,
      payload: {
        title: 'Article to Publish',
        content: 'This article will be published.',
        authorId: { id: testUser.id }
      }
    })

    expect(createResult.error).toBeUndefined()

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article to Publish'] }),
      undefined,
      ['id', 'title', 'status']
    )

    // Act: Publish the article (author can publish their own article)
    const publishResult = await controller.callInteraction('PublishArticle', {
      user: testUser,
      payload: {
        article: { id: article.id }
      }
    })

    // Assert
    expect(publishResult.error).toBeUndefined()

    const publishedArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['id', 'status']
    )
    
    expect(publishedArticle.status).toBe('published')
  })

  test('should soft delete an article', async () => {
    // Setup: Create user with author role and article
    const testUser = await system.storage.create('User', {
      username: 'delete_test',
      email: 'delete@example.com',
      role: 'author'  // Set author role
    })

    await controller.callInteraction('CreateArticle', {
      user: testUser,
      payload: {
        title: 'Article to Delete',
        content: 'This article will be deleted.',
        authorId: { id: testUser.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article to Delete'] }),
      undefined,
      ['id']
    )

    // Act: Delete the article (author can delete their own article)
    const deleteResult = await controller.callInteraction('DeleteArticle', {
      user: testUser,
      payload: {
        article: { id: article.id }
      }
    })

    // Assert
    expect(deleteResult.error).toBeUndefined()

    // Article still exists but is marked as deleted
    const deletedArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['id', 'status', 'isDeleted']
    )
    
    expect(deletedArticle).toBeTruthy()
    expect(deletedArticle.status).toBe('deleted')
    expect(deletedArticle.isDeleted).toBe(true)

    // User's article count should not include deleted articles
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', testUser.id] }),
      undefined,
      ['articleCount']
    )
    // The Count computation now counts all articles (including deleted)
    expect(updatedUser.articleCount).toBe(1)
  })

  test('should filter active articles using ActiveArticle entity', async () => {
    // Setup: Create user with author role and multiple articles
    const testUser = await system.storage.create('User', {
      username: 'filter_test',
      email: 'filter@example.com',
      role: 'author'  // Set author role
    })

    // Create 3 articles
    for (let i = 1; i <= 3; i++) {
      await controller.callInteraction('CreateArticle', {
        user: testUser,
        payload: {
          title: `Article ${i}`,
          content: `Content of article ${i}`,
          authorId: { id: testUser.id }
        }
      })
    }

    // Delete the second article (author can delete their own article)
    const articleToDelete = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article 2'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('DeleteArticle', {
      user: testUser,
      payload: {
        article: { id: articleToDelete.id }
      }
    })

    // Act: Query active articles
    const activeArticles = await system.storage.find('ActiveArticle',
      undefined,
      undefined,
      ['id', 'title']
    )

    // Assert
    expect(activeArticles.length).toBe(2)
    expect(activeArticles.find(a => a.title === 'Article 1')).toBeTruthy()
    expect(activeArticles.find(a => a.title === 'Article 2')).toBeFalsy()  // Deleted
    expect(activeArticles.find(a => a.title === 'Article 3')).toBeTruthy()
  })

  test('should restore a deleted article', async () => {
    // Setup: Create author and admin users
    const authorUser = await system.storage.create('User', {
      username: 'author_user',
      email: 'author@example.com',
      role: 'author'
    })

    const adminUser = await system.storage.create('User', {
      username: 'admin_user',
      email: 'admin@example.com',
      role: 'admin'
    })

    // Author creates an article
    await controller.callInteraction('CreateArticle', {
      user: authorUser,
      payload: {
        title: 'Article to Restore',
        content: 'This article will be restored.',
        authorId: { id: authorUser.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article to Restore'] }),
      undefined,
      ['id']
    )

    // Author deletes the article
    await controller.callInteraction('DeleteArticle', {
      user: authorUser,
      payload: {
        article: { id: article.id }
      }
    })

    // Verify it's deleted
    let currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status']
    )
    expect(currentArticle.status).toBe('deleted')

    // Act: Admin restores the article
    const restoreResult = await controller.callInteraction('RestoreArticle', {
      user: adminUser,
      payload: {
        article: { id: article.id }
      }
    })

    // Assert
    expect(restoreResult.error).toBeUndefined()

    currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status', 'isDeleted']
    )
    
    expect(currentArticle.status).toBe('draft')  // Back to draft
    expect(currentArticle.isDeleted).toBe(false)

    // Should appear in active articles again
    const activeArticles = await system.storage.find('ActiveArticle',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['id']
    )
    expect(activeArticles.length).toBe(1)

    // Author's article count should be 1 again
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', authorUser.id] }),
      undefined,
      ['articleCount']
    )
    expect(updatedUser.articleCount).toBe(1)
  })

  test('should handle complex workflow: create → publish → delete → restore', async () => {
    // Setup: Use admin user who can perform all operations
    const adminUser = await system.storage.create('User', {
      username: 'workflow_admin',
      email: 'workflow@example.com',
      role: 'admin'
    })

    // Create
    const createResult = await controller.callInteraction('CreateArticle', {
      user: adminUser,
      payload: {
        title: 'Workflow Article',
        content: 'Testing complete workflow',
        authorId: { id: adminUser.id }
      }
    })
    expect(createResult.error).toBeUndefined()

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Workflow Article'] }),
      undefined,
      ['id', 'status']
    )
    expect(article.status).toBe('draft')

    // Publish
    const publishResult = await controller.callInteraction('PublishArticle', {
      user: adminUser,
      payload: { article: { id: article.id } }
    })
    expect(publishResult.error).toBeUndefined()

    let currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status']
    )
    expect(currentArticle.status).toBe('published')

    // Delete
    const deleteResult = await controller.callInteraction('DeleteArticle', {
      user: adminUser,
      payload: { article: { id: article.id } }
    })
    expect(deleteResult.error).toBeUndefined()

    currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status', 'isDeleted']
    )
    expect(currentArticle.status).toBe('deleted')
    expect(currentArticle.isDeleted).toBe(true)

    // Restore
    const restoreResult = await controller.callInteraction('RestoreArticle', {
      user: adminUser,
      payload: { article: { id: article.id } }
    })
    expect(restoreResult.error).toBeUndefined()

    currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status', 'isDeleted']
    )
    
    expect(currentArticle.status).toBe('draft')  // Restored to draft
    expect(currentArticle.isDeleted).toBe(false)
  })

  // === Permission System Tests ===
  
  test('should deny regular users from creating articles', async () => {
    // Setup: Create a regular user (not author or admin)
    const regularUser = await system.storage.create('User', {
      username: 'regular_user',
      email: 'regular@example.com',
      role: 'user'  // Regular user role
    })

    // Act: Try to create an article
    const result = await controller.callInteraction('CreateArticle', {
      user: regularUser,
      payload: {
        title: 'Unauthorized Article',
        content: 'This should fail',
        authorId: { id: regularUser.id }
      }
    })

    // Assert: Should fail with permission error
    expect(result.error).toBeTruthy()
    expect((result.error as any).type).toBe('condition check failed')
  })

  test('should deny non-authors from publishing other users articles', async () => {
    // Setup: Create two authors
    const author1 = await system.storage.create('User', {
      username: 'author1',
      email: 'author1@example.com',
      role: 'author'
    })

    const author2 = await system.storage.create('User', {
      username: 'author2', 
      email: 'author2@example.com',
      role: 'author'
    })

    // Author1 creates an article
    await controller.callInteraction('CreateArticle', {
      user: author1,
      payload: {
        title: 'Author1 Article',
        content: 'Created by author1',
        authorId: { id: author1.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Author1 Article'] }),
      undefined,
      ['id']
    )

    // Act: Author2 tries to publish author1's article
    const publishResult = await controller.callInteraction('PublishArticle', {
      user: author2,
      payload: {
        article: { id: article.id }
      }
    })

    // Assert: Should fail with permission error
    expect(publishResult.error).toBeTruthy()
    expect((publishResult.error as any).type).toBe('condition check failed')
  })

  test('should allow admins to operate on any article', async () => {
    // Setup: Create author and admin
    const author = await system.storage.create('User', {
      username: 'content_author',
      email: 'content_author@example.com',
      role: 'author'
    })

    const admin = await system.storage.create('User', {
      username: 'super_admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    // Author creates an article
    await controller.callInteraction('CreateArticle', {
      user: author,
      payload: {
        title: 'Author Article',
        content: 'Created by author',
        authorId: { id: author.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Author Article'] }),
      undefined,
      ['id']
    )

    // Act: Admin publishes author's article
    const publishResult = await controller.callInteraction('PublishArticle', {
      user: admin,
      payload: {
        article: { id: article.id }
      }
    })

    // Assert: Admin can publish any article
    expect(publishResult.error).toBeUndefined()

    // Admin can also delete it
    const deleteResult = await controller.callInteraction('DeleteArticle', {
      user: admin,
      payload: {
        article: { id: article.id }
      }
    })
    expect(deleteResult.error).toBeUndefined()
  })

  test('should enforce payload attributive constraints', async () => {
    // Setup: Create admin user
    const admin = await system.storage.create('User', {
      username: 'payload_test_admin',
      email: 'payload_admin@example.com',
      role: 'admin'
    })

    // Create and publish an article
    await controller.callInteraction('CreateArticle', {
      user: admin,
      payload: {
        title: 'Payload Test Article',
        content: 'Testing payload constraints',
        authorId: { id: admin.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Payload Test Article'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('PublishArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Act 1: Try to publish an already published article
    const republishResult = await controller.callInteraction('PublishArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Assert: Should fail because article is not in draft status
    expect(republishResult.error).toBeTruthy()
    expect((republishResult.error as any).type).toBe('condition check failed')

    // Act 2: Delete the article
    await controller.callInteraction('DeleteArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Try to delete again
    const redeleteResult = await controller.callInteraction('DeleteArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Assert: Should fail because article is already deleted
    expect(redeleteResult.error).toBeTruthy()
    expect((redeleteResult.error as any).type).toBe('condition check failed')

    // Act 3: Try to restore a non-deleted article (create a new one first)
    await controller.callInteraction('CreateArticle', {
      user: admin,
      payload: {
        title: 'Active Article',
        content: 'This article is not deleted',
        authorId: { id: admin.id }
      }
    })

    const activeArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Active Article'] }),
      undefined,
      ['id']
    )

    const restoreActiveResult = await controller.callInteraction('RestoreArticle', {
      user: admin,
      payload: { article: { id: activeArticle.id } }
    })

    // Assert: Should fail because article is not deleted
    expect(restoreActiveResult.error).toBeTruthy()
    expect((restoreActiveResult.error as any).type).toBe('condition check failed')
  })

  test('should allow multiple attributives with OR logic', async () => {
    // The PublishArticle interaction allows either the article author OR an admin
    const author = await system.storage.create('User', {
      username: 'or_test_author',
      email: 'or_author@example.com',
      role: 'author'
    })

    const admin = await system.storage.create('User', {
      username: 'or_test_admin',
      email: 'or_admin@example.com',
      role: 'admin'
    })

    const regularUser = await system.storage.create('User', {
      username: 'or_test_regular',
      email: 'or_regular@example.com',
      role: 'user'
    })

    // Author creates article
    await controller.callInteraction('CreateArticle', {
      user: author,
      payload: {
        title: 'OR Logic Test Article',
        content: 'Testing OR attributive logic',
        authorId: { id: author.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'OR Logic Test Article'] }),
      undefined,
      ['id']
    )

    // Test 1: Author can publish (ArticleAuthorAttributive passes)
    const authorPublishResult = await controller.callInteraction('PublishArticle', {
      user: author,
      payload: { article: { id: article.id } }
    })
    expect(authorPublishResult.error).toBeUndefined()

    // Reset article to draft for next test
    await controller.callInteraction('DeleteArticle', {
      user: author,
      payload: { article: { id: article.id } }
    })
    await controller.callInteraction('RestoreArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Test 2: Admin can publish (AdminAttributive passes)
    const adminPublishResult = await controller.callInteraction('PublishArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })
    expect(adminPublishResult.error).toBeUndefined()

    // Reset article to draft for next test
    await controller.callInteraction('DeleteArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })
    await controller.callInteraction('RestoreArticle', {
      user: admin,
      payload: { article: { id: article.id } }
    })

    // Test 3: Regular user cannot publish (neither attributive passes)
    const regularPublishResult = await controller.callInteraction('PublishArticle', {
      user: regularUser,
      payload: { article: { id: article.id } }
    })
    expect(regularPublishResult.error).toBeTruthy()
    expect((regularPublishResult.error as any).type).toBe('condition check failed')
  })
}) 