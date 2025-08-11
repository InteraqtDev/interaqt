const { Entity, Property, Relation } = require('./dist/index.js');

// Create entities
const userEntity = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' })
  ]
});

const postEntity = Entity.create({
  name: 'Post',
  properties: [
    Property.create({ name: 'title', type: 'string' })
  ]
});

// Create input relations
const userLikesPost = Relation.create({
  name: 'UserLikesPost',
  source: userEntity,
  sourceProperty: 'likedPosts',
  target: postEntity,
  targetProperty: 'likedBy',
  type: 'n:n'
});

const userSharesPost = Relation.create({
  name: 'UserSharesPost',
  source: userEntity,
  sourceProperty: 'sharedPosts',
  target: postEntity,
  targetProperty: 'sharedBy',
  type: 'n:n'
});

// Create merged relation
const userInteractsPost = Relation.create({
  name: 'UserInteractsPost',
  sourceProperty: 'interactedPosts',
  targetProperty: 'interactedBy',
  inputRelations: [userLikesPost, userSharesPost]
});

console.log('Merged relation source:', userInteractsPost.source);
console.log('Merged relation source.name:', userInteractsPost.source.name);
console.log('Merged relation target:', userInteractsPost.target);
console.log('Merged relation target.name:', userInteractsPost.target.name);
