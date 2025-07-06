import { Relation, Property, Count } from 'interaqt'
import { User, Style, Version } from './entities'

// === User-Style Relations ===
export const UserStyleRelation = Relation.create({
  source: Style,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'createdStyles',
  type: 'n:1'
})

// === User-Version Relations ===
export const UserVersionRelation = Relation.create({
  source: Version,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'createdVersions',
  type: 'n:1'
})

// Add computed properties to User entity after relations are defined
User.properties.push(
  Property.create({
    name: 'createdStyleCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserStyleRelation,
      direction: 'target'
    })
  }),
  Property.create({
    name: 'publishedStyleCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserStyleRelation,
      direction: 'target',
      attributeQuery: [['source', { attributeQuery: ['status'] }]],
      callback: function(relation) {
        return relation.source.status === 'published'
      }
    })
  }),
  Property.create({
    name: 'createdVersionCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserVersionRelation,
      direction: 'target'
    })
  })
)