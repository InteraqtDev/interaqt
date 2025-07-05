import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB
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
      Property.create({ name: 'createdAt', type: 'string' }),
      Property.create({
        name: 'status',
        type: 'string',
        computation: ArticleLifecycleStateMachine,
        defaultValue: () => 'draft'
      }),
      Property.create({
        name: 'isDeleted',
        type: 'boolean',
        defaultValue: () => false,
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
            createdAt: new Date().toISOString(),
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
    sourceEntity: Article,
    filterCondition: MatchExp.atom({
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
      defaultValue: () => 0,
      computation: Count.create({
        record: UserArticleRelation,
        direction: 'target'
        // Remove the callback for now - just count all articles
      })
    })
  )

  // === Interactions ===
  const CreateArticle = Interaction.create({
    name: 'CreateArticle',
    action: Action.create({ name: 'createArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'title', required: true }),
        PayloadItem.create({ name: 'content', required: true }),
        PayloadItem.create({ name: 'authorId', base: User, isRef: true, required: true })
      ]
    })
  })

  const PublishArticle = Interaction.create({
    name: 'PublishArticle',
    action: Action.create({ name: 'publishArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'articleId', base: Article, isRef: true, required: true })
      ]
    })
  })

  const DeleteArticle = Interaction.create({
    name: 'DeleteArticle',
    action: Action.create({ name: 'deleteArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'articleId', base: Article, isRef: true, required: true })
      ]
    })
  })

  const RestoreArticle = Interaction.create({
    name: 'RestoreArticle',
    action: Action.create({ name: 'restoreArticle' }),
    payload: Payload.create({
      items: [
        PayloadItem.create({ name: 'articleId', base: Article, isRef: true, required: true })
      ]
    })
  })

  // Now add transfers to the state machine
  ArticleLifecycleStateMachine.transfers = [
    StateTransfer.create({
      current: draftState,
      next: publishedState,
      trigger: PublishArticle,
      computeTarget: (event) => ({ id: event.payload.articleId.id })
    }),
    StateTransfer.create({
      current: publishedState,
      next: deletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.articleId.id })
    }),
    StateTransfer.create({
      current: draftState,
      next: deletedState,
      trigger: DeleteArticle,
      computeTarget: (event) => ({ id: event.payload.articleId.id })
    }),
    StateTransfer.create({
      current: deletedState,
      next: draftState,
      trigger: RestoreArticle,
      computeTarget: (event) => ({ id: event.payload.articleId.id })
    })
  ]

  // Collect all definitions
  const entities = [User, Article, ActiveArticle]
  const relations = [UserArticleRelation]
  const interactions = [CreateArticle, PublishArticle, DeleteArticle, RestoreArticle]

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller(
      system,
      entities,
      relations,
      [],  // activities
      interactions,
      [],  // dictionaries
      []   // side effects
    )

    await controller.setup(true)
  })

  test('should create an article', async () => {
    // Setup: Create a test user
    const testUser = await system.storage.create('User', {
      username: 'john_doe',
      email: 'john@example.com'
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
    // Setup: Create user and article
    const testUser = await system.storage.create('User', {
      username: 'jane_doe',
      email: 'jane@example.com'
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

    // Act: Publish the article
    const publishResult = await controller.callInteraction('PublishArticle', {
      user: testUser,
      payload: {
        articleId: { id: article.id }
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
    // Setup: Create user and article
    const testUser = await system.storage.create('User', {
      username: 'delete_test',
      email: 'delete@example.com'
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

    // Act: Delete the article
    const deleteResult = await controller.callInteraction('DeleteArticle', {
      user: testUser,
      payload: {
        articleId: { id: article.id }
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
    // Setup: Create user and multiple articles
    const testUser = await system.storage.create('User', {
      username: 'filter_test',
      email: 'filter@example.com'
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

    // Delete the second article
    const articleToDelete = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article 2'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('DeleteArticle', {
      user: testUser,
      payload: {
        articleId: { id: articleToDelete.id }
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
    // Setup: Create and delete an article
    const testUser = await system.storage.create('User', {
      username: 'restore_test',
      email: 'restore@example.com'
    })

    await controller.callInteraction('CreateArticle', {
      user: testUser,
      payload: {
        title: 'Article to Restore',
        content: 'This article will be restored.',
        authorId: { id: testUser.id }
      }
    })

    const article = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'title', value: ['=', 'Article to Restore'] }),
      undefined,
      ['id']
    )

    // Delete the article
    await controller.callInteraction('DeleteArticle', {
      user: testUser,
      payload: {
        articleId: { id: article.id }
      }
    })

    // Verify it's deleted
    let currentArticle = await system.storage.findOne('Article',
      MatchExp.atom({ key: 'id', value: ['=', article.id] }),
      undefined,
      ['status']
    )
    expect(currentArticle.status).toBe('deleted')

    // Act: Restore the article
    const restoreResult = await controller.callInteraction('RestoreArticle', {
      user: testUser,
      payload: {
        articleId: { id: article.id }
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

    // User's article count should be 1 again
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', testUser.id] }),
      undefined,
      ['articleCount']
    )
    expect(updatedUser.articleCount).toBe(1)
  })

  test('should handle complex workflow: create → publish → delete → restore', async () => {
    // Setup
    const testUser = await system.storage.create('User', {
      username: 'workflow_test',
      email: 'workflow@example.com'
    })

    // Create
    const createResult = await controller.callInteraction('CreateArticle', {
      user: testUser,
      payload: {
        title: 'Workflow Article',
        content: 'Testing complete workflow',
        authorId: { id: testUser.id }
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
      user: testUser,
      payload: { articleId: { id: article.id } }
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
      user: testUser,
      payload: { articleId: { id: article.id } }
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
      user: testUser,
      payload: { articleId: { id: article.id } }
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
}) 